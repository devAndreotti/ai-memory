# AI Memory Frontend Phase 3 Implementation Plan

Scope: local React + Vite mock frontend only. Keep this as a UI/product prototype. Do not change MCP tools, hooks, ingestion, database, token flow, server runtime, or VPS deploy.

Current baseline:

- App shell lives in `src/App.tsx`.
- Mock API contract lives in `src/lib/api-contract.ts`.
- Fixtures live in `src/mocks/memory.ts`.
- Shared types live in `src/types.ts`.
- Main styling lives in `src/styles.css`.
- Existing smoke test lives in `tests/smoke.spec.ts`.

Required verification:

1. Run `npm run build`.
2. Run `npm run test:smoke`.
3. Run `npm audit --json`.
4. Capture/update screenshots in `../outputs/` for changed views when smoke runs.

## Non-Goals

- Do not connect to the real VPS yet.
- Do not add backend routes.
- Do not add persistence beyond local mock state or `localStorage` where already used.
- Do not add heavy graph libraries unless clearly justified. The VPS has 1 GB RAM, so keep the frontend bundle modest.
- Do not remove existing phase 2 features: command palette, page reader enhancements, API state panels, project graph, pin/unpin.

## Slice 1: Reader Agent View

Goal: add a reader mode toggle with `Human` and `Agent`.

Expected behavior:

- `Human` mode keeps the current readable page body.
- `Agent` mode shows memory retrieval structure instead of long prose.
- Mode can be local component state; no backend persistence required.
- The selected mode must not alter the source page data.

Agent view sections:

- `Retrieval hint`: short text from fixture or derived fallback.
- `Rules`: linked rule pages or rule-like notes.
- `Decisions`: linked decision pages or decision-like notes.
- `Gotchas`: page kind `gotcha`, missing links, and warnings.
- `Paths`: current path, resolved links, backlinks.
- `Freshness`: `updated_at`, tier, kind, pinned status.

Implementation notes:

- Extend `ReaderPage` in `src/types.ts` only if needed.
- Prefer adding a focused component such as `src/components/ReaderModeSwitch.tsx` or extending `ReaderEnhancements.tsx`.
- Add mock fields in `src/mocks/memory.ts` if deriving from current body is too brittle.
- Keep the toggle visually compact near the reader header.

Acceptance criteria:

- Reader shows `Human` and `Agent` controls.
- Agent mode exposes retrieval-oriented blocks without duplicating the entire Markdown body.
- Existing ToC, backlinks, resolved links, copy path, and missing-page state still work.
- Smoke test opens reader, switches to Agent mode, and checks one Agent section is visible.

## Slice 2: State Actions

Goal: every API/error state has a clear action, not only a message.

Required actions:

- `401 auth`: button `Copy token command`.
- `API offline`: button `Retry`.
- `empty project`: button `Open project`.
- `missing page`: buttons `Copy path` and `Open backlinks`.

Expected behavior:

- `Copy token command` writes a mock command to clipboard, for example `export AI_MEMORY_READ_TOKEN=...`.
- `Retry` updates visible UI state, for example a timestamp or transient `Retrying` label.
- `Open project` navigates to the empty project fixture, currently `scriply-old-746d84d`.
- `Copy path` writes the missing fixture path.
- `Open backlinks` opens the missing-page reader or scrolls/focuses its backlinks panel.

Implementation notes:

- `ApiStatePanels.tsx` owns the state-lab UI.
- Keep action behavior mock-only and deterministic.
- If actions require routing, pass callbacks from `App.tsx`.
- Use existing `small-action` styling unless a more specific state-action class is needed.

Acceptance criteria:

- Each state card/detail exposes the required actions.
- Buttons are keyboard reachable.
- Clipboard actions show short success feedback.
- Smoke test covers at least `401 Copy token command`, `API offline Retry`, and `missing page Open backlinks`.

## Slice 3: Search Results Upgrade

Goal: make search usable as an information retrieval surface.

Required result groups:

- `Project`
- `Page`
- `Path`
- `Content hit`

Required filters:

- Project filter.
- Kind filter: `rule`, `decision`, `fact`, `gotcha`.
- Tier filter: `working`, `episodic`, `semantic`, `procedural`.

Expected behavior:

- Search results are grouped by category.
- Filters work against mock data.
- Empty filtered results show a clear empty state.
- Clicking a project opens project view.
- Clicking a page/path/content hit opens reader.

Implementation notes:

- Existing `PageHit` may need a `type` field or a derived UI model.
- Add fixture coverage in `src/mocks/memory.ts` for all four result groups.
- Prefer a focused component such as `src/components/SearchExplorer.tsx` if `App.tsx` grows too large.
- Keep command palette behavior intact.

Acceptance criteria:

- Search view shows grouped sections with counts.
- Filters visibly change result set.
- At least one project, one page, one path, and one content hit appear in mock data.
- Smoke test performs a filter change and opens one result.

## Slice 4: Diff/Drift Audit

Goal: add an audit view for memory hygiene problems.

Required issue types:

- Indexed page missing on disk.
- Empty project.
- Orphan pages.
- Broken backlinks.
- Duplicates.
- Stale pages.

Expected behavior:

- Add a new navigation item or integrate under `States` as an `Audit` tab.
- Each issue has severity, project, path, explanation, and action.
- Actions can be mock-only: open reader, open project, copy path, mark reviewed.
- The view should be dense and operational, not a marketing/status page.

Implementation notes:

- Add `MemoryDriftIssue` type in `src/types.ts`.
- Add `driftIssues` fixture in `src/mocks/memory.ts`.
- Add mock API function such as `listDriftIssues()` in `src/lib/api-contract.ts`.
- Prefer component `src/components/DriftAudit.tsx`.

Acceptance criteria:

- Audit view lists all six issue types.
- User can filter or segment by issue type.
- Missing page issue opens the existing missing-page reader.
- Empty project issue opens the empty project.
- Smoke test opens audit view and verifies all issue types exist.

## Slice 5: Graph Upgrade

Goal: make the graph useful for exploration, not just decorative.

Required controls:

- Filter by page kind: `rule`, `decision`, `fact`, `gotcha`.
- Search inside graph.
- `Local graph` mode: only selected project and neighbors.
- `Global graph` mode: all graph nodes/edges.
- Edge hover/focus shows which pages created the relationship.

Expected behavior:

- Graph keeps current Obsidian-like direction: compact nodes, quiet canvas, side inspector.
- Filtering changes visible nodes/edges and side list.
- Search highlights matching nodes and can focus a result.
- Local/global mode is visible and keyboard accessible.
- Hovering or focusing an edge reveals source paths in a tooltip or inspector area.

Implementation notes:

- Current graph component is `src/components/ProjectGraph.tsx`.
- Add kind metadata to `ProjectGraphEdge` or derive it from linked fixture pages.
- Keep pan/zoom working.
- Avoid force simulation unless necessary; deterministic layout is fine for mock.
- Do not add a heavy graph dependency for this phase.

Acceptance criteria:

- Kind filters work and can be combined or selected one at a time.
- Search focuses or highlights a project.
- Local/global mode changes graph density.
- Edge hover/focus displays relation paths.
- Smoke test opens graph, uses search, toggles local/global, and verifies edge detail text.

## Suggested Implementation Order

1. State Actions.
2. Reader Agent View.
3. Search Results Upgrade.
4. Diff/Drift Audit.
5. Graph Upgrade.

Reasoning: state actions and reader mode are narrow. Search and audit need fixture/type work. Graph upgrade touches the most interaction and visual logic.

## Suggested File Ownership

- `src/App.tsx`: routing and cross-view callbacks only.
- `src/types.ts`: shared types.
- `src/mocks/memory.ts`: all mock data.
- `src/lib/api-contract.ts`: mock API functions.
- `src/components/ApiStatePanels.tsx`: state actions.
- `src/components/ReaderEnhancements.tsx` plus optional reader mode component: reader modes.
- `src/components/SearchExplorer.tsx`: grouped search.
- `src/components/DriftAudit.tsx`: audit view.
- `src/components/ProjectGraph.tsx`: graph upgrade.
- `src/styles.css`: shared styling and responsive behavior.
- `tests/smoke.spec.ts`: user-flow coverage.

## Quality Bar

- Keep UI dense, legible, and operational.
- Do not introduce nested cards.
- Avoid text overlap on desktop and mobile.
- Keep all interactions mock-deterministic.
- Keep bundle reasonable and build fast.
- Clearly preserve that this is read-only frontend work.
