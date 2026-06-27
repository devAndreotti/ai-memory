//! `GET /w/:workspace/:project` — page tree + recent activity.

use std::collections::BTreeMap;
use std::sync::Arc;

use askama::Template;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::Html;

use crate::state::WebState;
use crate::templates::{Folder, PageRow, ProjectView, humanize, page_href};

/// Handler for `GET /w/:workspace/:project`.
pub(crate) async fn handler(
    State(state): State<Arc<WebState>>,
    Path((workspace, project)): Path<(String, String)>,
) -> Result<Html<String>, StatusCode> {
    let pages = state
        .reader
        .list_pages(&workspace, &project)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let page_count = pages.len();
    let last_updated_relative = pages
        .iter()
        .map(|p| p.updated_at.as_str())
        .max()
        .map(humanize)
        .unwrap_or_default();

    // Build sidebar folder tree (group by first path segment).
    let mut folder_map: BTreeMap<String, Vec<PageRow>> = BTreeMap::new();
    for p in &pages {
        let folder = p
            .path
            .split('/')
            .next()
            .and_then(|seg| {
                // Only treat it as a folder prefix if there's a slash in the path.
                if p.path.contains('/') {
                    Some(seg.to_owned())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "(root)".to_owned());
        folder_map.entry(folder).or_default().push(PageRow {
            path: p.path.clone(),
            href: page_href(&workspace, &project, &p.path),
            title: p.title.clone(),
            kind: p.kind.clone(),
            updated_relative: humanize(&p.updated_at),
        });
    }
    let folders: Vec<Folder> = folder_map
        .into_iter()
        .map(|(name, pages)| {
            let page_count_label = pages.len().to_string();
            Folder {
                name,
                page_count_label,
                pages,
            }
        })
        .collect();
    let folder_count = folders.len();

    // Recent pages: sort by updated_at desc, take 20.
    let mut sorted = pages.clone();
    sorted.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    sorted.truncate(20);
    let recent: Vec<PageRow> = sorted
        .into_iter()
        .map(|p| PageRow {
            path: p.path.clone(),
            href: page_href(&workspace, &project, &p.path),
            title: p.title.clone(),
            kind: p.kind.clone(),
            updated_relative: humanize(&p.updated_at),
        })
        .collect();

    let html = ProjectView {
        workspace,
        project,
        page_count_label: page_count.to_string(),
        folder_count_label: folder_count.to_string(),
        last_updated_relative,
        folders,
        recent,
    }
    .render()
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Html(html))
}
