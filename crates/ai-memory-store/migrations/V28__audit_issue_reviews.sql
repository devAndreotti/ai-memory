-- Persists "reviewed" state for audit/drift issues (stale, duplicate,
-- orphan, broken-backlink, missing-page, empty-project) so it survives a
-- page reload / a different browser, instead of living only in the
-- frontend's local React state.
--
-- `issue_key` is the same stable string the frontend already computes
-- client-side (e.g. "stale:onemob:notes/foo.md" or
-- "empty-project:default:onemob") — no new ID scheme, just a place to
-- persist the existing one.
CREATE TABLE audit_issue_reviews (
    workspace_id BLOB NOT NULL,
    issue_key TEXT NOT NULL,
    reviewed_at INTEGER NOT NULL,
    reviewed_by TEXT,
    PRIMARY KEY (workspace_id, issue_key)
);
