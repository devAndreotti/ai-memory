//! Web router state — the handle a request handler receives.
//!
//! Holds the read-only store pool + the wiki handle. Cheap to clone
//! (everything inside is `Arc`-shaped already), so axum's
//! `State<Arc<WebState>>` extractor stays free of clone-heavy code.

use ai_memory_store::{ReaderPool, WriterHandle};
use ai_memory_wiki::Wiki;

/// Shared state for every web route. Construct once via
/// [`crate::router`].
#[derive(Clone)]
pub struct WebState {
    /// Read-only SQLite pool — drives FTS5 search, page metadata,
    /// project list aggregates.
    pub reader: ReaderPool,
    /// Wiki handle — reads page bodies from disk.
    pub wiki: Wiki,
    /// Scoped, narrow write access. The `/api/v1` surface is read-only by
    /// design (see `decisions/read-only-frontend-api.md`); this exists
    /// ONLY for the audit "mark reviewed" endpoints, which persist a
    /// small opt-in review state and touch nothing else. Do not widen
    /// this into a general admin surface — that decision stays with
    /// `/admin`.
    pub writer: WriterHandle,
}

impl WebState {
    /// Build a new shared state.
    #[must_use]
    pub fn new(reader: ReaderPool, wiki: Wiki, writer: WriterHandle) -> Self {
        Self {
            reader,
            wiki,
            writer,
        }
    }
}
