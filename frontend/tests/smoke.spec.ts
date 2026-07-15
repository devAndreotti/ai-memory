import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.AI_MEMORY_FRONTEND_URL ?? "http://127.0.0.1:5173/";
const outputDir = resolve(process.cwd(), "..", "outputs");

test.setTimeout(120_000);

test("phase 3 cockpit flows", async ({ page }) => {
  mkdirSync(outputDir, { recursive: true });

  // Home + pin (preserved phase 2 behaviour).
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Memory buckets" })).toBeVisible();
  await expect(page.getByTitle("Pin scriply-old-746d84d")).toBeVisible();
  await page.getByTitle("Pin scriply-old-746d84d").click();
  await expect(page.getByTitle("Unpin scriply-old-746d84d").first()).toBeVisible();
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase3-home.png"), fullPage: true });

  // Command palette still navigates (preserved phase 2 behaviour).
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.getByLabel("Search pages, projects, workspaces, and paths").fill("quality");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "quality-gate" })).toBeVisible();

  // Slice 2 — state actions (Phase 4 operational layout).
  // Switcher items use role="option" (listbox), so select via class + text filter.
  await page.getByRole("button", { name: "States" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "401 auth" })).toBeVisible();
  await page.getByRole("button", { name: "Copy token command" }).click();
  await expect(page.locator(".action-log-list")).toBeVisible();
  await page.locator(".switcher-item").filter({ hasText: /API offline/ }).click();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".action-log-row strong").first()).toContainText("Retried");
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase3-states.png"), fullPage: true });
  await page.locator(".switcher-item").filter({ hasText: /Pagina sumida no disco/ }).click();
  await page.getByRole("button", { name: "Open backlinks", exact: true }).click();
  await expect(page.getByText("Page missing on disk")).toBeVisible();
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase3-missing-page.png"), fullPage: true });

  // Slice 1 — reader Human/Agent mode.
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.getByLabel("Search pages, projects, workspaces, and paths").fill("paytime");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Paytime integration" })).toBeVisible();
  await page.getByRole("button", { name: "Agent" }).click();
  await expect(page.getByRole("heading", { name: "Retrieval hint", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gotchas & warnings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Freshness", exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase3-reader-agent.png"), fullPage: true });
  await page.getByRole("button", { name: "Human" }).click();
  await expect(page.getByRole("heading", { name: "Retrieval hint", exact: true })).toBeHidden();
  await expect(page.getByText(/generated client code isolated/)).toBeVisible();
  await expect(page.getByText("Table of contents")).toBeVisible();

  // Slice 3 — grouped search with filters.
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Search memory").fill("");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("heading", { name: "All indexed results" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Content hits" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("button", { name: "decision", exact: true }).click();
  await expect(page.getByText("2 of 9 results")).toBeVisible();
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase3-search.png"), fullPage: true });
  await page.getByRole("button", { name: /PR babysit contract/ }).click();
  await expect(page.getByRole("heading", { name: "PR babysit contract" })).toBeVisible();

  // Slice 4 — drift audit (all six issue types).
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Audit" }).click();
  await expect(page.getByRole("heading", { name: "Memory drift audit" })).toBeVisible();
  await expect(page.getByText("Indexed page missing on disk")).toBeVisible();
  await expect(page.getByText("Empty project still indexed")).toBeVisible();
  await expect(page.getByText("Orphan page with no inbound links")).toBeVisible();
  await expect(page.getByText("Backlink points at a missing target")).toBeVisible();
  await expect(page.getByText("Near-duplicate of another note")).toBeVisible();
  await expect(page.getByText("Stale page past the freshness window")).toBeVisible();
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase3-audit.png"), fullPage: true });

  await page.getByRole("button", { name: /Missing on disk/ }).click();
  await page.getByRole("button", { name: "Open reader" }).click();
  await expect(page.getByText("Page missing on disk")).toBeVisible();

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Audit" }).click();
  await page.getByRole("button", { name: /Empty project/ }).click();
  await page.getByRole("button", { name: "Open project" }).click();
  await expect(page.getByRole("heading", { name: "scriply-old-746d84d" }).first()).toBeVisible();

  // Slice 5 — graph search, scope, and edge detail.
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Project graph" })).toBeVisible();
  await page.getByLabel("Search graph").fill("feed");
  await page.getByLabel("Search graph").press("Enter");
  await expect(page.locator(".graph-v2-inspector-head h2")).toHaveText("feed-dispatch");
  await page.getByRole("button", { name: "Local" }).click();
  await expect(page.getByRole("button", { name: "Local" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Global" }).click();
  await expect(page.getByRole("button", { name: "Global" })).toHaveAttribute("aria-pressed", "true");
  await page.locator(".graph-v2-edge-row").first().hover();
  await expect(page.locator(".graph-v2-edge-detail")).toContainText("notes/paytime-integration.md");
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase3-graph.png"), fullPage: true });

  // Mobile parity.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Memory buckets" })).toBeVisible();
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase3-mobile.png"), fullPage: true });

  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Project graph" })).toBeVisible();
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase3-graph-mobile.png"), fullPage: true });
});

test("phase 4 states responsive screenshots", async ({ page }) => {
  mkdirSync(outputDir, { recursive: true });

  // Seed the States page with logged actions so screenshots show real state.
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("button", { name: "States" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "401 auth" })).toBeVisible();

  // Auth: copy token.
  await page.getByRole("button", { name: "Copy token command" }).click();

  // Offline: retry.
  await page.locator(".switcher-item").filter({ hasText: /API offline/ }).click();
  await page.getByRole("button", { name: "Retry", exact: true }).click();

  // Missing: copy path.
  await page.locator(".switcher-item").filter({ hasText: /Pagina sumida no disco/ }).click();
  await page.getByRole("button", { name: "Copy path" }).click();

  // Verify action log populated before taking screenshots.
  await expect(page.locator(".action-log-list")).toBeVisible();

  // Screenshots at each target breakpoint (viewport resize keeps React state).
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase4-states-mobile.png"), fullPage: true });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase4-states-tablet-portrait.png"), fullPage: true });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase4-states-tablet-landscape.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase4-states-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 1980, height: 1080 });
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase4-states-large-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase4-states-ultrawide.png"), fullPage: true });

  // Optional: home overview at large desktop.
  await page.setViewportSize({ width: 1980, height: 1080 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.screenshot({ path: resolve(outputDir, "ai-memory-phase4-overview-large-desktop.png"), fullPage: true });
});
