# ai-memory frontend sandbox

React + Vite sandbox for redesigning the read-only `ai-memory` browser with mock data.

This frontend is intentionally isolated from MCP, hooks, the SQLite store, LLM providers, and admin/write surfaces. It mirrors the read-only `/api/v1` shapes so the UI can later switch from mocks to same-origin API calls.

## Local

```bash
cd frontend
npm install
npm run dev
```

## Build

```bash
cd frontend
npm run build
```

The static output lands in `frontend/dist`.

## Plug into ai-memory

Once the UI is ready to ship:

```bash
ai-memory serve \
  --transport http \
  --bind 127.0.0.1:49374 \
  --enable-web \
  --web-ui-dir ./frontend/dist
```

The existing Rust server injects `<base href>` and `ai-memory-base-path`, then serves this SPA under `/web`.
