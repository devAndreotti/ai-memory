//! Persisted "reviewed" state for audit/drift issues.
//!
//! The frontend already computes a stable `issue_key` client-side (e.g.
//! `"stale:onemob:notes/foo.md"`) — this module just gives that key a place
//! to live server-side instead of an ephemeral React `useState`, so
//! "reviewed" survives a reload or a different browser/device.

use ai_memory_core::WorkspaceId;
use jiff::Timestamp;
use rusqlite::{Connection, params};
use std::collections::HashSet;

use crate::error::StoreResult;

/// Mark an audit issue reviewed for this workspace. Idempotent — reviewing
/// an already-reviewed issue just refreshes `reviewed_at`/`reviewed_by`.
///
/// # Errors
/// Returns [`crate::error::StoreError::Sql`] for any SQL failure.
pub fn mark_reviewed(
    conn: &Connection,
    workspace_id: WorkspaceId,
    issue_key: &str,
    reviewed_by: Option<&str>,
) -> StoreResult<()> {
    let now = Timestamp::now().as_microsecond();
    conn.execute(
        "INSERT INTO audit_issue_reviews (workspace_id, issue_key, reviewed_at, reviewed_by) \
         VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(workspace_id, issue_key) DO UPDATE SET \
            reviewed_at = excluded.reviewed_at, \
            reviewed_by = excluded.reviewed_by",
        params![workspace_id.as_bytes(), issue_key, now, reviewed_by],
    )?;
    Ok(())
}

/// Clear a previously-reviewed mark. Idempotent — unmarking an issue that
/// was never reviewed (or already unmarked) is a no-op, not an error.
///
/// # Errors
/// Returns [`crate::error::StoreError::Sql`] for any SQL failure.
pub fn unmark_reviewed(
    conn: &Connection,
    workspace_id: WorkspaceId,
    issue_key: &str,
) -> StoreResult<()> {
    conn.execute(
        "DELETE FROM audit_issue_reviews WHERE workspace_id = ?1 AND issue_key = ?2",
        params![workspace_id.as_bytes(), issue_key],
    )?;
    Ok(())
}

/// All reviewed issue keys for a workspace, for the caller to check
/// `reviewed_keys.contains(&issue.id)` per issue when building an audit
/// response.
///
/// # Errors
/// Returns [`crate::error::StoreError::Sql`] for any SQL failure.
pub fn reviewed_keys_for_workspace(
    conn: &Connection,
    workspace_id: WorkspaceId,
) -> StoreResult<HashSet<String>> {
    let mut stmt =
        conn.prepare("SELECT issue_key FROM audit_issue_reviews WHERE workspace_id = ?1")?;
    let rows = stmt.query_map(params![workspace_id.as_bytes()], |row| row.get(0))?;
    let mut out = HashSet::new();
    for row in rows {
        out.insert(row?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use crate::Store;
    use tempfile::TempDir;

    #[tokio::test]
    async fn mark_unmark_and_list_round_trip() {
        let tmp = TempDir::new().unwrap();
        let store = Store::open(tmp.path()).unwrap();
        let ws = store
            .writer
            .get_or_create_workspace("default")
            .await
            .unwrap();

        store
            .writer
            .mark_audit_issue_reviewed(ws, "stale:proj:notes/a.md".into(), Some("ricardo".into()))
            .await
            .unwrap();
        store
            .writer
            .mark_audit_issue_reviewed(ws, "orphan:proj:notes/b.md".into(), None)
            .await
            .unwrap();

        let keys = store.reader.reviewed_issue_keys(ws).await.unwrap();
        assert!(keys.contains("stale:proj:notes/a.md"));
        assert!(keys.contains("orphan:proj:notes/b.md"));
        assert_eq!(keys.len(), 2);

        // Idempotent re-mark doesn't create a duplicate row / error.
        store
            .writer
            .mark_audit_issue_reviewed(ws, "stale:proj:notes/a.md".into(), Some("ricardo".into()))
            .await
            .unwrap();
        let keys = store.reader.reviewed_issue_keys(ws).await.unwrap();
        assert_eq!(keys.len(), 2);

        store
            .writer
            .unmark_audit_issue_reviewed(ws, "stale:proj:notes/a.md".into())
            .await
            .unwrap();
        let keys = store.reader.reviewed_issue_keys(ws).await.unwrap();
        assert!(!keys.contains("stale:proj:notes/a.md"));
        assert!(keys.contains("orphan:proj:notes/b.md"));
        assert_eq!(keys.len(), 1);

        // Unmarking something never marked is a no-op, not an error.
        store
            .writer
            .unmark_audit_issue_reviewed(ws, "missing-page:proj:x.md".into())
            .await
            .unwrap();
    }
}
