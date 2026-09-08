# SPEC: ai-memory (Shared Long-Term Memory for AI Coding Agents)

## 1. Overview and Purpose
`ai-memory` is a high-performance, local-first long-term memory server and CLI written in Rust. It enables seamless context continuity across disparate AI coding agent harnesses (Claude Code, OpenAI Codex, Antigravity CLI, Gemini CLI, Cursor, OpenCode, Kimi Code, Command Code, Pi, OMP, Kiro CLI) by compiling sanitized lifecycle observations into a Git-backed, human-readable Markdown wiki.

## 2. Core Functional Requirements

### 2.1 Zero-Friction Lifecycle Capture
- **Hook Ingestion:** Intercept lifecycle events (`SessionStart`, `PreInvocation`, `ToolUse`, `PostToolUse`, `PostCompaction`, `Stop`, `SessionEnd`).
- **Sanitization & Budgeting:**
  - User prompts and compactions: bounded up to 16 KiB.
  - Tool outputs / notifications: bounded up to 2 KiB (with durable backstop of 16 KiB).
  - Sensitive token scrubbing and secret redaction.
- **Path Exclusion Policy:** Respect `[capture] ignore_paths` from nearest `.aimemoryignore` or project marker file.

### 2.2 Shared Wiki & Knowledge Representation
- **Plain Markdown in Git:** Persistent memory stored in Markdown files (`_briefs/`, `_handoffs/`, `_slots/`, `overview.md`, `decisions.md`, `rules.md`, `gotchas.md`).
- **No Vector DB Lock-in:** Human-editable, grep-able, compatible with Obsidian and standard Git versioning.
- **Handoff Contract:** Bounded context packets injected into the next session start of any supported AI agent.

### 2.3 Opt-in Managed Workstreams (`ai-memory run`)
- Cross-harness session continuity (`ai-memory run claude` -> `ai-memory run codex` -> `ai-memory run antigravity`).
- Portable visible-event ledger maintaining turn-by-turn causality across harness switches.
- Origin-marked packet delivery preventing self-referential loopback ingestion.

### 2.4 Multi-Operator Memory Slots
- When enabled (`[slots] per_user = true`), isolates user-specific context under `_slots/<operator>/` while maintaining shared access to repository-wide architecture and decisions.

### 2.5 MCP & Remote Interfaces
- Stdio and SSE/HTTP Model Context Protocol (MCP) server endpoints (`memory_query`, `memory_handoff_accept`, `memory_save_decision`, `memory_search`).

## 3. Non-Functional Requirements
- **Performance:** Sub-millisecond hook capture acknowledgement; asynchronous background ledger consolidation.
- **Safety:** Offline-first capable, zero accidental data leakage, bounded payload memory allocation.
- **Cross-Platform:** Full support on Linux (Docker / native), macOS (ARM64 / x86_64) and Windows (WSL2 / native).
