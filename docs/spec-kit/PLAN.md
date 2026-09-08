# PLAN: ai-memory Architectural Execution Plan

## 1. System Architecture & Crates Layout

The system is structured as a cargo workspace with decoupled crates:

```
crates/
├── ai-memory-core/         # Domain entities, markdown serializer/parser, git driver, slot manager
├── ai-memory-server/       # Axum HTTP/SSE server, stdio MCP transport, authentication layer
├── ai-memory-cli/          # Unified CLI (`ai-memory run`, `install-mcp`, `finalize-session`)
├── ai-memory-hooks/        # Lifecycle hook parsers and formatters for 15+ AI harnesses
├── ai-memory-embeddings/   # Local/Remote embedding providers (Ollama, OpenAI, Voyage, Gemini)
└── ai-memory-ledger/       # Portable visible-event ledger engine and search index
```

## 2. Integration Pipeline & Harness Adapters
1. **Hook Interception Layer:** Intercept stdin/stdout/JSON from Claude Code, Codex, Antigravity, Gemini, OpenCode, Kimi, Cursor.
2. **Sanitization Engine:** Fast regex & token filter removing keys, tokens, `.env` content, and applying `.aimemoryignore`.
3. **Consolidation Worker:** Asynchronous background LLM summarizer generating structured wiki entries (`_briefs/YYYY-MM-DD-*.md`).
4. **Handoff Dispatcher:** Generates unified handoff payload for the next agent session initialization.

## 3. Deployment & Operational Workflows
- **Local Embedded Mode:** Runs as lightweight CLI on dev workstation (Windows / macOS / Linux).
- **VPS / Remote Daemon Mode:** Runs as systemd service or Docker container on remote server (e.g. OSTG01 VPS).
- **Tailscale Mesh Integration:** Authenticated agent connections over private tailnet.
