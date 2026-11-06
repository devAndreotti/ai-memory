//! Per-project memory audit page.
//!
//! `GET /w/:workspace/:project/audit` lists this project's memory-quality
//! issues: pages whose markdown file is gone, orphans, pages with unresolved
//! outgoing links, duplicate titles and stale episodic pages. It reads the
//! same store helpers as the JSON project overview
//! (`memory_health_for_project`, `health_detail_for_project`,
//! `latest_pages_with_project_ids`), confined to one resolved project.
//! `?type=<kind>` narrows the table to one issue type.

use std::sync::Arc;

use askama::Template;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use serde::Deserialize;

use ai_memory_store::HealthPage;

use crate::state::WebState;
use crate::templates::{AuditIssueRow, AuditTypeRow, AuditView, page_href, project_href};

/// Rows listed per issue type. The headline counts for stale, duplicate and
/// orphan pages come from the store's counters and stay exact; the other two
/// are list lengths and show a `+` when they hit this cap.
const AUDIT_LIST_LIMIT: usize = 200;

/// Upper bound on pages stat-ed for on-disk presence, matching the JSON
/// overview's cap. Newest pages are checked first.
const MISSING_ON_DISK_STAT_CAP: usize = 2000;

/// Issue types, in display order (most severe first).
const KINDS: [&str; 5] = ["missing", "broken", "duplicate", "orphan", "stale"];

/// `?type=` filter.
#[derive(Debug, Default, Deserialize)]
pub(crate) struct AuditQuery {
    #[serde(default, rename = "type")]
    pub kind: Option<String>,
}

/// Handler for `GET /w/:workspace/:project/audit`.
pub(crate) async fn handler(
    axum::Extension(i18n): axum::Extension<ai_memory_core::i18n::Localizer>,
    State(state): State<Arc<WebState>>,
    viewer: Option<axum::Extension<ai_memory_core::AuthorizedViewer>>,
    Path((workspace, project)): Path<(String, String)>,
    Query(query): Query<AuditQuery>,
) -> Response {
    let viewer_id = viewer.as_ref().map(|axum::Extension(viewer)| viewer.user());
    // Fail closed: an unknown project is the not-found page, a project the
    // viewer may not read is a 403 — same resolution as the graph route.
    let scope = match super::resolve_read_scope(&state, viewer_id, &workspace, &project).await {
        Ok(scope) => scope,
        Err(refusal) => return super::page::localized_refusal_response(&i18n, &refusal),
    };
    match render(&i18n, &state, &workspace, &project, scope, query).await {
        Ok(html) => html.into_response(),
        Err(status) => status.into_response(),
    }
}

async fn render(
    i18n: &ai_memory_core::i18n::Localizer,
    state: &Arc<WebState>,
    workspace: &str,
    project: &str,
    scope: ai_memory_store::ResolvedScope,
    query: AuditQuery,
) -> Result<Html<String>, StatusCode> {
    let workspace_id = scope.workspace_id;
    let project_id = scope.project_id;
    let (stale, duplicates, orphans) = state
        .reader
        .memory_health_for_project(workspace_id, project_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let detail = state
        .reader
        .health_detail_for_project(workspace_id, project_id, AUDIT_LIST_LIMIT)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let missing = missing_on_disk(state, workspace_id, project_id).await?;

    let filter = query
        .kind
        .filter(|k| KINDS.contains(&k.as_str()))
        .unwrap_or_default();
    let base_href = format!("{}/audit", project_href(workspace, project));

    let list_count = |len: usize| -> (u64, bool) {
        (
            u64::try_from(len).unwrap_or(u64::MAX),
            len >= AUDIT_LIST_LIMIT,
        )
    };
    let (missing_count, missing_capped) = list_count(missing.len());
    let (broken_count, broken_capped) = list_count(detail.broken_links.len());

    let lists: [(&str, u64, bool, &[HealthPage]); 5] = [
        ("missing", missing_count, missing_capped, &missing),
        ("broken", broken_count, broken_capped, &detail.broken_links),
        ("duplicate", duplicates, false, &detail.duplicates),
        ("orphan", orphans, false, &detail.orphans),
        ("stale", stale, false, &detail.stale),
    ];

    let mut types = Vec::with_capacity(lists.len());
    let mut issues = Vec::new();
    let mut total: u64 = 0;
    for (kind, count, capped, pages) in lists {
        total = total.saturating_add(count);
        types.push(AuditTypeRow {
            kind: kind.to_owned(),
            label: i18n.text(&format!("web-audit-type-{kind}")),
            explanation: i18n.text(&format!("web-audit-type-{kind}-help")),
            count_label: if capped {
                format!("{count}+")
            } else {
                count.to_string()
            },
            has_issues: count > 0,
            severity: severity(kind).to_owned(),
            href: format!("{base_href}?type={kind}"),
            active: filter == kind,
        });
        if !filter.is_empty() && filter != kind {
            continue;
        }
        let label = i18n.text(&format!("web-audit-type-{kind}"));
        let reason = i18n.text(&format!("web-audit-detail-{kind}"));
        issues.extend(pages.iter().map(|page| AuditIssueRow {
            title: if page.title.is_empty() {
                page.path.clone()
            } else {
                page.title.clone()
            },
            path: page.path.clone(),
            href: page_href(workspace, project, &page.path),
            kind_label: label.clone(),
            detail: if page.kind.is_empty() {
                reason.clone()
            } else {
                format!("{reason} ({})", page.kind)
            },
            severity: severity(kind).to_owned(),
        }));
    }

    AuditView {
        i18n: i18n.clone(),
        workspace: workspace.to_owned(),
        project: project.to_owned(),
        project_href: project_href(workspace, project),
        audit_href: base_href,
        filter,
        total,
        missing_count,
        broken_count,
        duplicate_count: duplicates,
        orphan_count: orphans,
        stale_count: stale,
        types,
        issues,
    }
    .render()
    .map(Html)
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

/// Severity key for an issue type: `high`, `medium` or `low`.
fn severity(kind: &str) -> &'static str {
    match kind {
        "missing" => "high",
        "broken" | "duplicate" => "medium",
        _ => "low",
    }
}

/// Indexed latest pages of this project whose markdown file is gone.
///
/// Same check as the JSON overview's `missing_on_disk_pages` (one
/// `is_file` per row from `latest_pages_with_project_ids`), run on the
/// blocking pool so a cold or network-mounted volume cannot stall the
/// runtime.
async fn missing_on_disk(
    state: &Arc<WebState>,
    workspace_id: ai_memory_core::WorkspaceId,
    project_id: ai_memory_core::ProjectId,
) -> Result<Vec<HealthPage>, StatusCode> {
    let refs = state
        .reader
        .latest_pages_with_project_ids(workspace_id, Some(project_id), MISSING_ON_DISK_STAT_CAP)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let wiki = state.wiki.clone();
    tokio::task::spawn_blocking(move || {
        refs.into_iter()
            .filter(|r| {
                !wiki
                    .project_root(workspace_id, r.project_id)
                    .join(&r.page.path)
                    .is_file()
            })
            .map(|r| r.page)
            .take(AUDIT_LIST_LIMIT)
            .collect()
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
