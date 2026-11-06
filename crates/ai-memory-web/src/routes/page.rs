//! `GET /w/:workspace/:project/p/*path` — rendered markdown page.

use std::cmp::Reverse;
use std::sync::Arc;

use ai_memory_core::PagePath;
use ai_memory_store::PageSummary;
use askama::Template;
use axum::extract::rejection::QueryRejection;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};

use crate::markdown;
use crate::state::WebState;
use crate::templates::{
    AgentLinkGroup, AgentLinkRow, LinkStatusRow, NamespaceView, NotFoundView, OutlineItem,
    PageRow, PageView, RELATED_LIMIT, RelatedRow, encode_segment, history_href, page_href,
    project_href,
};

/// Pages per namespace listing page.
const NAMESPACE_PAGE_SIZE: usize = 25;

/// Namespace listing options. Strings, so a bad value falls back to a
/// default instead of becoming axum's 400.
#[derive(Default, serde::Deserialize)]
pub(crate) struct NamespaceQuery {
    #[serde(flatten)]
    knowledge: crate::knowledge::KnowledgeQuery,
    sort: Option<String>,
    page: Option<String>,
    /// Reader view: `agent`, or the human view for anything else.
    mode: Option<String>,
}

/// Handler for `GET /w/:workspace/:project/p/*path`.
pub(crate) async fn handler(
    axum::Extension(i18n): axum::Extension<ai_memory_core::i18n::Localizer>,
    State(state): State<Arc<WebState>>,
    viewer: Option<axum::Extension<ai_memory_core::AuthorizedViewer>>,
    actor: Option<axum::Extension<ai_memory_core::ActorContext>>,
    Path((workspace, project, path)): Path<(String, String, String)>,
    query: Result<Query<NamespaceQuery>, QueryRejection>,
) -> Response {
    // A query string that does not parse at all (a repeated key) is ignored
    // too: every page URL takes this extractor, not only namespaces.
    let query = query.map(|Query(q)| q).unwrap_or_default();
    let viewer_id = viewer.as_ref().map(|axum::Extension(v)| v.user());
    if let Err(refusal) = super::authorize_read(&state, viewer, &workspace, &project).await {
        return localized_refusal_response(&i18n, &refusal);
    }
    let meta = match state.reader.page_meta(&workspace, &project, &path).await {
        Ok(Some(m)) => m,
        // Not a page — it may be a namespace (directory) link, e.g. the OKF
        // bundle index's `[_lint/](_lint/)`. Render a listing rather than a
        // bare 404 (#603).
        Ok(None) => {
            return namespace_or_not_found(&i18n, &state, &workspace, &project, &path, &query)
                .await;
        }
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let page_path = match PagePath::new(&path) {
        Ok(p) => p,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    // An indexed page whose file is gone gets its own state, not a 404: the
    // index still knows it, so "not found" would send the reader looking
    // for a typo. Same check as the health API's missing-on-disk list.
    let markdown_doc = match state
        .wiki
        .read_page(meta.workspace_id, meta.project_id, &page_path)
    {
        Ok(doc) => Some(doc),
        Err(_)
            if !state
                .wiki
                .project_root(meta.workspace_id, meta.project_id)
                .join(&meta.path)
                .is_file() =>
        {
            None
        }
        Err(_) => return not_found_response(&i18n),
    };
    let missing_on_disk = markdown_doc.is_none();

    // Drop a leading H1 that repeats the title — the template already
    // renders the title in its header, so leaving it in the body
    // duplicates it.
    let (rendered, targets) = match &markdown_doc {
        Some(doc) => {
            let mut targets = ai_memory_wiki::extract_links(&doc.body, &page_path);
            targets.extend(ai_memory_wiki::extract_relation_links(&doc.frontmatter));
            (
                markdown::render_document(
                    markdown::strip_leading_h1(&doc.body, &meta.title),
                    &workspace,
                    &project,
                ),
                targets,
            )
        }
        None => (
            markdown::Rendered {
                html: String::new(),
                outline: Vec::new(),
            },
            Vec::new(),
        ),
    };

    // The far end of each link is filtered by what the viewer may read, so a
    // backlink from a restricted project never reaches the sidebar. Every
    // outgoing link is loaded (bounded by the page's own link count) so each
    // one can be marked resolved or missing.
    let links = match state
        .reader
        .page_links_preview(
            meta.workspace_id,
            meta.project_id,
            meta.path.clone(),
            viewer_id,
            RELATED_LIMIT.max(targets.len()),
        )
        .await
    {
        Ok(l) => l,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let agent_groups = agent_groups(&links.links, &links.backlinks, &workspace, &project);
    let backlinks: Vec<_> = links.backlinks.into_iter().take(RELATED_LIMIT).collect();
    let (cited_by, cited_by_more) =
        related_rows(backlinks, links.backlinks_total, &workspace, &project);
    let link_status = link_status_rows(&targets, &links.links, &workspace, &project);
    let unresolved: Vec<LinkStatusRow> = link_status
        .iter()
        .filter(|row| !row.resolved)
        .map(|row| LinkStatusRow {
            label: row.label.clone(),
            href: String::new(),
            resolved: false,
            scope_hint: row.scope_hint.clone(),
        })
        .collect();
    let cites_more = link_status.len().saturating_sub(RELATED_LIMIT);
    let cites: Vec<LinkStatusRow> = link_status.into_iter().take(RELATED_LIMIT).collect();

    // `#id` alone would resolve against the injected `<base href>`.
    let own_href = page_href(&workspace, &project, &meta.path);
    let outline: Vec<OutlineItem> = rendered
        .outline
        .iter()
        .filter(|h| (2..=3).contains(&h.level))
        .map(|h| OutlineItem {
            href: format!("{own_href}#{}", encode_segment(&h.id)),
            text: h.text.clone(),
            nested: h.level == 3,
        })
        .collect();
    let outline = if outline.len() < 2 {
        Vec::new()
    } else {
        outline
    };

    let knowledge = match crate::knowledge::view(
        &state,
        &meta,
        &workspace,
        &project,
        viewer_id,
        super::api::owner_filter_for(actor),
        &query.knowledge,
    )
    .await
    {
        Ok(v) => v,
        Err(status) => return status.into_response(),
    };
    let project_href = project_href(&workspace, &project);
    let supersedes_path = meta.supersedes.unwrap_or_default();
    let supersedes_href = if supersedes_path.is_empty() {
        String::new()
    } else {
        page_href(&workspace, &project, &supersedes_path)
    };

    let (author_username, author_name, author_email) = meta.author.map_or_else(
        || (String::new(), String::new(), String::new()),
        |a| {
            (
                a.username,
                a.name.unwrap_or_default(),
                a.email.unwrap_or_default(),
            )
        },
    );

    let history_href = history_href(&workspace, &project, &path);
    let agent_mode = query.mode.as_deref() == Some("agent");
    let agent_href = format!("{own_href}?mode=agent");
    let retrieval_hint = i18n.format(
        "web-reader-hint",
        &[
            ("kind", meta.kind.clone()),
            ("tier", meta.tier.clone()),
            ("pinned", if meta.pinned { "yes" } else { "no" }.to_owned()),
        ],
    );
    match (PageView {
        i18n: i18n.clone(),
        knowledge,
        workspace,
        project,
        project_href,
        path: meta.path,
        title: meta.title,
        kind: meta.kind,
        tier: meta.tier,
        pinned: meta.pinned,
        expired: meta.expired,
        updated_relative: i18n.relative(&meta.updated_at),
        created_relative: i18n.relative(&meta.created_at),
        updated_at: meta.updated_at,
        created_at: meta.created_at,
        supersedes_path,
        supersedes_href,
        body_html: rendered.html,
        history_href,
        outline,
        cited_by,
        cited_by_more,
        cites,
        cites_more,
        author_username,
        author_name,
        author_email,
        agent_mode,
        human_href: own_href,
        agent_href,
        retrieval_hint,
        agent_groups,
        unresolved,
        missing_on_disk,
    }
    .render())
    {
        Ok(html) => Html(html).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

/// Neighbours as rows, and how many of `total` were left out.
/// A neighbour in another project carries a `workspace/project` hint.
fn related_rows(
    related: Vec<ai_memory_store::RelatedPage>,
    total: usize,
    workspace: &str,
    project: &str,
) -> (Vec<RelatedRow>, usize) {
    let more = total.saturating_sub(related.len());
    let rows = related
        .into_iter()
        .map(|r| RelatedRow {
            href: page_href(&r.workspace, &r.project, &r.path),
            scope_hint: if r.workspace == workspace && r.project == project {
                String::new()
            } else {
                format!("{}/{}", r.workspace, r.project)
            },
            title: r.title,
        })
        .collect();
    (rows, more)
}

/// Each distinct outgoing link target, in link order, marked resolved when
/// it matches one of the page's resolved (and viewer-readable) links.
/// A target with no readable match is shown as written, without a link.
fn link_status_rows(
    targets: &[ai_memory_core::LinkTarget],
    resolved: &[ai_memory_store::RelatedPage],
    workspace: &str,
    project: &str,
) -> Vec<LinkStatusRow> {
    let mut seen = std::collections::HashSet::new();
    let mut rows = Vec::new();
    for target in targets {
        let ws = target.workspace.as_deref().unwrap_or(workspace);
        let proj = target.project.as_deref().unwrap_or(project);
        let path = target.path.as_str();
        if !seen.insert((ws.to_owned(), proj.to_owned(), path.to_owned())) {
            continue;
        }
        let scope_hint = if ws == workspace && proj == project {
            String::new()
        } else {
            format!("{ws}/{proj}")
        };
        let hit = resolved
            .iter()
            .find(|r| r.workspace == ws && r.project == proj && r.path == path);
        rows.push(match hit {
            Some(r) => LinkStatusRow {
                label: r.title.clone(),
                href: page_href(&r.workspace, &r.project, &r.path),
                resolved: true,
                scope_hint,
            },
            None => LinkStatusRow {
                label: path.to_owned(),
                href: String::new(),
                resolved: false,
                scope_hint,
            },
        });
    }
    // Without a body to read targets from (the file is gone), the index's
    // resolved links are all there is to show.
    if targets.is_empty() {
        rows = resolved
            .iter()
            .map(|r| LinkStatusRow {
                label: r.title.clone(),
                href: page_href(&r.workspace, &r.project, &r.path),
                resolved: true,
                scope_hint: if r.workspace == workspace && r.project == project {
                    String::new()
                } else {
                    format!("{}/{}", r.workspace, r.project)
                },
            })
            .collect();
    }
    rows
}

/// Outgoing links, then back-links, grouped by kind for the agent view:
/// rules, decisions, gotchas, facts, then everything else. A page linked
/// both ways appears once.
fn agent_groups(
    links: &[ai_memory_store::RelatedPage],
    backlinks: &[ai_memory_store::RelatedPage],
    workspace: &str,
    project: &str,
) -> Vec<AgentLinkGroup> {
    const GROUPS: [(&str, &str); 4] = [
        ("rule", "web-reader-group-rule"),
        ("decision", "web-reader-group-decision"),
        ("gotcha", "web-reader-group-gotcha"),
        ("fact", "web-reader-group-fact"),
    ];
    let mut groups: Vec<AgentLinkGroup> = GROUPS
        .iter()
        .map(|&(_, label_id)| AgentLinkGroup {
            label_id,
            rows: Vec::new(),
        })
        .chain(std::iter::once(AgentLinkGroup {
            label_id: "web-reader-group-other",
            rows: Vec::new(),
        }))
        .collect();
    let mut seen = std::collections::HashSet::new();
    for r in links.iter().chain(backlinks) {
        let href = page_href(&r.workspace, &r.project, &r.path);
        if !seen.insert(href.clone()) {
            continue;
        }
        let slot = GROUPS
            .iter()
            .position(|(kind, _)| *kind == r.kind)
            .unwrap_or(GROUPS.len());
        let path = if r.workspace == workspace && r.project == project {
            r.path.clone()
        } else {
            format!("{}/{}:{}", r.workspace, r.project, r.path)
        };
        groups[slot].rows.push(AgentLinkRow {
            href,
            title: r.title.clone(),
            path,
        });
    }
    groups.retain(|g| !g.rows.is_empty());
    groups
}

/// When a path is not a page, list the pages under it as a namespace
/// (directory) if any exist; otherwise 404. Powers the OKF bundle index's
/// directory links and any relative `dir/` link (#603).
async fn namespace_or_not_found(
    i18n: &ai_memory_core::i18n::Localizer,
    state: &Arc<WebState>,
    workspace: &str,
    project: &str,
    path: &str,
    query: &NamespaceQuery,
) -> Response {
    let namespace = path.trim_end_matches('/');
    if namespace.is_empty() {
        return not_found_response(i18n);
    }
    let prefix = format!("{namespace}/");
    let all = match state.reader.list_unexpired_pages(workspace, project).await {
        Ok(p) => p,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let mut under: Vec<_> = all
        .into_iter()
        .filter(|p| p.path.starts_with(&prefix))
        .collect();
    if under.is_empty() {
        return not_found_response(i18n);
    }
    let sort_title = query.sort.as_deref() == Some("title");
    // Titles repeat (session pages), so ties fall back to recency, then path.
    let newest_first = |page: &PageSummary| {
        (
            Reverse(page.updated_at.parse::<jiff::Timestamp>().ok()),
            page.path.clone(),
        )
    };
    if sort_title {
        under.sort_by_cached_key(|page| (page.title.to_lowercase(), newest_first(page)));
    } else {
        under.sort_by_cached_key(newest_first);
    }
    let total = under.len();
    let last_page = total.div_ceil(NAMESPACE_PAGE_SIZE);
    let page = query
        .page
        .as_deref()
        .and_then(|raw| raw.parse::<usize>().ok())
        .filter(|&n| n > 0)
        .map_or(1, |n| n.min(last_page));
    let start = (page - 1) * NAMESPACE_PAGE_SIZE;
    let pages: Vec<PageRow> = under
        .into_iter()
        .skip(start)
        .take(NAMESPACE_PAGE_SIZE)
        .map(|p| PageRow {
            href: page_href(workspace, project, &p.path),
            path: p.path,
            title: p.title,
            kind: p.kind,
            updated_relative: i18n.relative(&p.updated_at),
            agent_label: None,
        })
        .collect();
    // Resolved against the injected `<base href>`, so a bare `?sort=`
    // would land on the web root.
    let href = page_href(workspace, project, &prefix);
    let sort = if sort_title { "title" } else { "updated" };
    let page_link = |n: usize| format!("{href}?sort={sort}&page={n}");
    match (NamespaceView {
        i18n: i18n.clone(),
        workspace: workspace.to_owned(),
        project: project.to_owned(),
        project_href: project_href(workspace, project),
        namespace: namespace.to_owned(),
        first: start + 1,
        last: start + pages.len(),
        pages,
        total,
        sort_updated_href: format!("{href}?sort=updated"),
        sort_title_href: format!("{href}?sort=title"),
        sort_title,
        prev_href: (page > 1).then(|| page_link(page - 1)),
        next_href: (page < last_page).then(|| page_link(page + 1)),
    }
    .render())
    {
        Ok(html) => Html(html).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

/// Render a 404 response with the not-found template body.
/// The HTML answer to a scope the viewer cannot read.
///
/// A refusal is a 403 that says so, never the not-found page: a developer
/// whose grant was never issued must not be sent looking for a typo. A
/// repository that does not exist is still the ordinary not-found page.
pub(crate) fn refusal_response(refusal: &ai_memory_store::ScopeResolutionError) -> Response {
    localized_refusal_response(&ai_memory_core::i18n::Localizer::default(), refusal)
}

pub(crate) fn localized_refusal_response(
    i18n: &ai_memory_core::i18n::Localizer,
    refusal: &ai_memory_store::ScopeResolutionError,
) -> Response {
    if refusal.is_forbidden() {
        (
            StatusCode::FORBIDDEN,
            if i18n.tag() == "en" {
                refusal.to_string()
            } else {
                i18n.text("web-project-access-denied")
            },
        )
            .into_response()
    } else if refusal.is_not_found() {
        not_found_response(i18n)
    } else if refusal.is_bad_request() {
        (
            StatusCode::BAD_REQUEST,
            if i18n.tag() == "en" {
                refusal.to_string()
            } else {
                i18n.text("web-invalid-scope")
            },
        )
            .into_response()
    } else {
        StatusCode::INTERNAL_SERVER_ERROR.into_response()
    }
}

pub(crate) fn not_found_response(i18n: &ai_memory_core::i18n::Localizer) -> Response {
    let html = NotFoundView { i18n: i18n.clone() }
        .render()
        .unwrap_or_else(|_| "<h1>Not found</h1>".to_owned());
    (StatusCode::NOT_FOUND, Html(html)).into_response()
}
