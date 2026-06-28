# AI Memory Frontend Phase 2 Plan

Scope: local React + Vite mock frontend only. No MCP, hooks, ingestion, database, token flow, or backend runtime changes.

## Parallel Work Slices

The intended split was four independent agent slices with disjoint files:

1. Command palette
   - Owns `src/components/CommandPalette.tsx`.
   - Adds `Ctrl+K`, keyboard navigation, and search over workspace, project, page, and path fixtures.
   - Test: build passes; Playwright opens palette, types query, navigates to page.

2. Reader upgrades
   - Owns `src/components/ReaderEnhancements.tsx`.
   - Adds table of contents, backlinks, resolved/missing links, collapsible frontmatter, and copy-path action.
   - Test: build passes; reader renders ToC anchors, link states, and missing-page banner.

3. API state lab
   - Owns `src/components/ApiStatePanels.tsx`.
   - Adds real failure-state fixtures: `401 auth`, API offline, empty project, and missing page on disk.
   - Test: build passes; each scenario can be selected and missing page opens reader.

4. Project graph
   - Owns `src/components/ProjectGraph.tsx`.
   - Adds simple cross-project wikilink map with nodes, edges, labels, and path evidence.
   - Test: build passes; graph opens project pages from nodes and edge list.

Execution note: the four subagents were started, but all failed with usage-limit errors. Main session implemented the same split directly while preserving the disjoint component boundaries.

## Integration Plan

1. Extend `src/types.ts`.
   - Add `ReaderPage`, `ReaderLink`, `ReaderBacklink`, `ApiScenario`, and `ProjectGraphEdge`.
   - Add `graph` to app views.

2. Extend mock API contract.
   - Add mock scenarios and graph edges.
   - Make `readPage(project, path)` distinguish resolved indexed pages from missing disk pages.
   - Keep all data in local fixtures.

3. Wire app shell.
   - Add Graph nav.
   - Add command palette overlay.
   - Route project/page/search/state/graph transitions through app state.

4. Style and responsive pass.
   - Add palette overlay, reader rails, state lab, graph canvas.
   - Keep mobile usable with five nav items and stacked panels.

## Verification Gates

1. `npm run build`
2. `npm audit --json`
3. Browser or Playwright smoke on:
   - home screen
   - `Ctrl+K` palette
   - reader ToC/backlinks/copy path
   - states lab and missing-page reader
   - graph view
   - mobile width

## Non-Goals

- No backend API implementation.
- No MCP tool behavior changes.
- No token-cost changes for AI agents.
- No database migration.
- No production deploy to VPS in this phase.
