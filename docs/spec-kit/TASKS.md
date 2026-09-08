# TASKS: ai-memory Implementation & Verification Tasks

## Phase 1: Core Engine & Ingestion (Complete)
- [x] Implement Markdown Wiki engine with Git auto-commit support.
- [x] Implement lifecycle hook handlers for Claude Code, Codex, Antigravity CLI, Cursor, Gemini.
- [x] Implement path exclusion policy (`[capture] ignore_paths`) and token redaction.

## Phase 2: Managed Workstreams & Ledger (Complete)
- [x] Implement `ai-memory run <agent>` with cross-harness state adoption.
- [x] Implement portable visible-event ledger and search index.
- [x] Implement multi-operator memory slots (`_slots/<operator>`).

## Phase 3: Extension & Verification (Active)
- [ ] Implement additional hook adapters for emerging agent runtimes.
- [ ] Optimize embeddings cache and cosine similarity search over large monorepos.
- [ ] Validate end-to-end handoff latency in offline scenarios.
