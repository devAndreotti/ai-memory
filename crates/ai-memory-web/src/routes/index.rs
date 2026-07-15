//! `GET /` — project list cards.

use std::sync::Arc;

use askama::Template;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Html;

use crate::state::WebState;
use crate::templates::{ProjectCard, ProjectsView, humanize, project_href};

/// Handler for `GET /`.
pub(crate) async fn handler(
    State(state): State<Arc<WebState>>,
) -> Result<Html<String>, StatusCode> {
    let summaries = state
        .reader
        .list_projects_with_stats()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let project_count = summaries.len();
    let total_pages = summaries.iter().map(|s| s.page_count).sum::<u64>();
    let active_projects = summaries.iter().filter(|s| s.page_count > 0).count();
    let last_updated_relative = summaries
        .iter()
        .filter_map(|s| s.last_updated.as_deref())
        .next()
        .map(humanize)
        .unwrap_or_default();

    let projects = summaries
        .into_iter()
        .map(|s| {
            let last_updated_relative = s.last_updated.as_deref().map(humanize).unwrap_or_default();
            let href = project_href(&s.workspace_name, &s.project_name);
            ProjectCard {
                workspace: s.workspace_name,
                project: s.project_name,
                page_count: s.page_count,
                last_updated_relative,
                href,
            }
        })
        .collect();

    let html = ProjectsView {
        projects,
        project_count_label: project_count.to_string(),
        page_count_label: total_pages.to_string(),
        active_project_count_label: active_projects.to_string(),
        last_updated_relative,
    }
    .render()
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Html(html))
}
