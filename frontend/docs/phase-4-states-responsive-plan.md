# AI Memory Frontend Phase 4: States + Responsive QA Plan

Scope: local React + Vite frontend prototype only. Keep all data mocked. Do not connect to VPS, MCP, hooks, database, ingestion, token flow, or backend runtime.

Current baseline after Phase 3:

- App shell: `src/App.tsx`
- States page: `src/components/ApiStatePanels.tsx`
- Audit page: `src/components/DriftAudit.tsx`
- Graph: `src/components/ProjectGraph.tsx`
- Search: `src/components/SearchExplorer.tsx`
- Reader: `src/components/ReaderEnhancements.tsx` and `src/components/ReaderModeSwitch.tsx`
- Fixtures: `src/mocks/memory.ts`
- Mock API: `src/lib/api-contract.ts`
- Shared styles: `src/styles.css`
- Smoke test: `tests/smoke.spec.ts`

Required verification:

1. `npm run build`
2. `npm run test:smoke`
3. `npm audit --json`
4. Capture screenshots for:
   - `390x900` mobile
   - `768x1024` tablet portrait
   - `1024x768` tablet landscape
   - `1440x900` desktop
   - `1980x1080` large desktop
   - `2560x1440` ultrawide

## Goals

1. Make `States` useful as an operational diagnostics page, not a grid of static cards.
2. Fix responsive behavior across mobile, tablet, desktop, large desktop, and ultrawide.
3. Keep visual language consistent with the current cockpit/Obsidian-like UI.
4. Avoid adding heavy dependencies.
5. Keep bundle static and VPS-friendly.

## Non-Goals

- No real API calls.
- No real auth/token persistence.
- No VPS deployment.
- No backend implementation.
- No graph library migration.
- No redesign of the whole app shell unless required for responsiveness.

## Slice 1: States Page Information Architecture

Problem:

The current `States` page has useful actions, but the layout still reads like disconnected cards. It needs a clearer operational flow.

Target structure:

- Top band: compact status overview.
- Main area: selected scenario detail with action history/feedback.
- Right or lower rail: scenario list and diagnostics metadata.
- Bottom area: recovery playbook or recent simulated events.

Recommended layout:

- `System status`: aggregate state, last retry time, active failure, cached data status.
- `Scenario detail`: icon, title, status code, explanation, recovery action buttons.
- `Action log`: latest mock actions such as copied token, retried API, opened missing backlinks.
- `Scenario switcher`: auth, offline, empty project, missing page, loading.
- `Recovery checklist`: deterministic checklist per scenario.

Implementation notes:

- Keep component ownership in `src/components/ApiStatePanels.tsx`.
- Add small subcomponents inside the file first; split only if it becomes hard to read.
- Extend `ApiScenario` in `src/types.ts` only if needed.
- Extend mock data in `src/mocks/memory.ts` for checklist/action metadata if needed.
- Keep callbacks from `App.tsx` minimal: open empty project, open missing page/backlinks.

Acceptance criteria:

- User can scan active system state in under one screen.
- Each scenario has visible actions and a recovery checklist.
- The selected scenario is visually dominant.
- Action feedback is persistent enough to notice, not a tiny transient label only.
- `States` no longer looks like a generic card grid.

## Slice 2: States Interactions

Required interactions:

- `401 auth`: copy token command, show copied state in action log.
- `API offline`: retry, show retry timestamp in action log.
- `empty project`: open empty project fixture.
- `missing page`: copy path and open backlinks/missing reader.
- `loading`: show warm cache behavior and disabled/secondary actions.

Additional suggested interactions:

- `Reset simulation`: clears action log and selected scenario.
- `Copy diagnostic bundle`: copies a mock JSON payload with active scenario, path, timestamp, and recovery hint.
- Keyboard navigation across scenario switcher.

Acceptance criteria:

- All action buttons are keyboard reachable.
- Copy actions work even if clipboard fails silently; UI still shows mock feedback.
- `Retry` changes visible state.
- Smoke test covers at least one copy action, retry, and missing-page navigation.

## Slice 3: Responsive Layout Rules

Breakpoints to support:

- Mobile: `<= 480px`
- Large mobile/small tablet: `481px - 767px`
- Tablet portrait: `768px - 900px`
- Tablet landscape/small laptop: `901px - 1199px`
- Desktop: `1200px - 1799px`
- Large desktop: `1800px - 2199px`
- Ultrawide: `>= 2200px`

Global layout requirements:

- No text overlap.
- No clipped nav labels where labels are meant to be visible.
- No cards stretched to unreadable line lengths.
- Main content should have a maximum readable width on ultrawide.
- Graph and States can use wider canvases, but text panels should remain constrained.
- Sidebar should not feel comically distant from content on 1980+ widths.

Recommended CSS strategy:

- Add a `.workspace-inner` wrapper only if needed; otherwise constrain major views individually.
- Use `max-width` for content-heavy views.
- Let graph/states/audit use wider max widths than reader/search.
- Add large-screen media query around `min-width: 1800px`.
- Add ultrawide media query around `min-width: 2200px`.
- Prefer CSS grid with `minmax()` and `clamp()` over viewport-scaling font sizes.

Suggested constraints:

- Reader max content width: `1280px`.
- Search max content width: `1400px`.
- States max content width: `1680px`.
- Audit max content width: `1680px`.
- Graph max content width: `1900px`.

Acceptance criteria:

- At `1980x1080`, States uses space intentionally instead of leaving awkward gaps or stretching text.
- At `2560x1440`, app remains centered/constrained where appropriate.
- At `768x1024`, States becomes two-column or stacked without overlap.
- At `390x900`, States actions remain reachable and readable.
- Sidebar/nav remains usable at all target widths.

## Slice 4: Tablet-Specific QA

Tablet issues to check:

- Sidebar height and nav wrapping.
- Command bar width.
- States scenario detail/action buttons wrapping.
- Audit rows/action buttons wrapping.
- Search filters stacking.
- Reader side rail stacking below content.
- Graph inspector below canvas.

Acceptance criteria:

- `768x1024` portrait has no horizontal scroll.
- `1024x768` landscape has no clipped cards or toolbar overlap.
- Touch targets stay at least around `36px` high for controls.
- Long project names and paths wrap or truncate deliberately.

## Slice 5: Mobile QA

Mobile issues to check:

- Six navigation icons fit cleanly.
- Sidebar/pinned section behavior is intentional.
- Command bar does not overflow.
- States detail appears before lower scenario cards.
- Action buttons wrap into a vertical stack.
- Reader kind chip stays next to title or wraps under it cleanly.
- Drift audit rows do not squeeze into unreadable columns.

Acceptance criteria:

- `390x900` has no horizontal scroll.
- Tap targets are usable.
- No important action requires hovering.
- Full-page screenshots show complete vertical flow.

## Slice 6: Large Desktop and Ultrawide QA

Large screen issues to check:

- Current content may hug the left side and waste space.
- Cards may become too wide.
- Reader lines may become too long.
- States may look sparse.
- Graph canvas may need more useful width while inspector remains readable.

Acceptance criteria:

- `1980x1080` screenshot looks designed, not accidentally stretched.
- `2560x1440` screenshot keeps readable panels constrained.
- States page uses extra width for diagnostics/action log, not oversized text.
- Graph canvas may expand, but inspector max width remains controlled.

## Slice 7: Smoke Test Expansion

Update `tests/smoke.spec.ts`.

Required screenshot outputs:

- `ai-memory-phase4-states-mobile.png`
- `ai-memory-phase4-states-tablet-portrait.png`
- `ai-memory-phase4-states-tablet-landscape.png`
- `ai-memory-phase4-states-desktop.png`
- `ai-memory-phase4-states-large-desktop.png`
- `ai-memory-phase4-states-ultrawide.png`
- Optional: `ai-memory-phase4-overview-large-desktop.png`

Test flow:

1. Open app.
2. Navigate to `States`.
3. Select `401 auth`, click `Copy token command`.
4. Select `API offline`, click `Retry`.
5. Select `missing page`, click `Copy path`.
6. Capture target viewport screenshots.
7. Verify key actions are visible at each viewport.

Acceptance criteria:

- Smoke test passes.
- Screenshots are generated under `../outputs`.
- No test relies on pixel-perfect assertions.
- Tests verify visibility and basic interaction only.

## Suggested Implementation Order

1. Improve `ApiStatePanels.tsx` structure and action log.
2. Add/adjust types and mock data only if needed.
3. Add responsive CSS for States.
4. Add global large-screen constraints.
5. Expand smoke screenshots.
6. Run build, smoke, audit.
7. Inspect screenshots manually and iterate.

## Files Likely To Change

- `src/components/ApiStatePanels.tsx`
- `src/styles.css`
- `src/types.ts`
- `src/mocks/memory.ts`
- `tests/smoke.spec.ts`

Avoid changing unrelated components unless screenshots show a responsive regression outside States.

## Final Report Requirements

At the end, report:

- Files changed.
- Commands run.
- Screenshots generated.
- Any remaining responsive risk.
- Confirmation that this is still local mock frontend only.
