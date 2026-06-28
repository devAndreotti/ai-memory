import type {
  ApiScenario,
  BriefingSnapshot,
  MemoryDriftIssue,
  MemoryHealth,
  PageHit,
  PageKind,
  PageSummary,
  ProjectGraphEdge,
  ProjectSummary,
  ReaderPage,
  SearchResult,
} from "../types";
import {
  apiScenarios,
  briefing,
  driftIssues,
  genericPage,
  health,
  missingPage,
  pageBodies,
  pageBody,
  pages,
  projectGraph,
  projects,
  searchHits,
  searchResults,
} from "../mocks/memory";

type ApiList<T> = T[] | { [key: string]: T[] };

interface ApiProject {
  workspace_name: string;
  project_name: string;
  page_count: number;
  last_updated: string | null;
}

interface ApiPageSummary {
  path: string;
  title: string;
  kind?: string;
  tier?: string;
  updated_at: string;
}

interface ApiRelatedPage {
  workspace?: string;
  project?: string;
  path: string;
  title: string;
  kind?: string;
}

interface ApiReaderPage extends ApiPageSummary {
  workspace?: string;
  project: string;
  pinned?: boolean;
  frontmatter?: Record<string, unknown>;
  body?: string;
  body_markdown?: string;
  links?: ApiRelatedPage[];
  backlinks?: ApiRelatedPage[];
}

interface ApiSearchHit {
  workspace?: string;
  project?: string;
  path: string;
  title: string;
  kind?: string;
  tier?: string;
  snippet: string;
  rank: number;
}

interface ApiGraphEdge {
  from_project: string;
  to_project: string;
  from_path: string;
  to_path: string;
}

interface ApiOverview {
  briefing: BriefingSnapshot;
  health: {
    stale: number;
    duplicates: number;
    orphans: number;
    stale_pages?: ApiRelatedPage[];
    duplicate_pages?: ApiRelatedPage[];
    orphan_pages?: ApiRelatedPage[];
  };
}

const workspaceName = "default";
const demoMode = import.meta.env.VITE_AI_MEMORY_DEMO === "1" || window.location.port === "5173";

export async function listProjects(): Promise<{ projects: ProjectSummary[] }> {
  if (demoMode) return delayed({ projects });
  const payload = await apiGet<ApiList<ApiProject>>("/projects");
  return { projects: unwrapList(payload, "projects").map(mapProject) };
}

export async function getProjectBriefing(): Promise<BriefingSnapshot> {
  if (demoMode) return delayed(briefing);
  const overview = await apiGet<ApiOverview>(`/workspaces/${encodeSegment(workspaceName)}/overview?limit=10`);
  return normalizeBriefing(overview.briefing);
}

export async function getMemoryHealth(): Promise<MemoryHealth> {
  if (demoMode) return delayed(health);
  const overview = await apiGet<ApiOverview>(`/workspaces/${encodeSegment(workspaceName)}/overview?limit=25`);
  return {
    duplicate_count: overview.health.duplicates,
    orphan_count: overview.health.orphans,
    stale_count: overview.health.stale,
  };
}

export async function listPages(project: string): Promise<{ pages: PageSummary[] }> {
  if (demoMode) return delayed({ pages: pages[project] ?? [] });
  if (!project) return { pages: [] };
  try {
    const payload = await apiGet<ApiList<ApiPageSummary>>(`/workspaces/${encodeSegment(workspaceName)}/projects/${encodeSegment(project)}/pages`);
    return { pages: unwrapList(payload, "pages").map(mapPageSummary) };
  } catch (error) {
    if (isNotFound(error)) return { pages: [] };
    throw error;
  }
}

export async function readPage(project = pageBody.project, path = pageBody.path): Promise<ReaderPage> {
  if (demoMode) {
    const key = `${project}/${path}`;
    const summary = pages[project]?.find((page) => page.path === path);
    return delayed(pageBodies[key] ?? (summary ? genericPage(project, summary) : missingPage(project, path || pageBody.path)));
  }

  const resolvedPath = path || (await listPages(project)).pages[0]?.path;
  if (!resolvedPath) return missingPage(project, "empty-project.md");

  try {
    const page = await apiGet<ApiReaderPage>(
      `/workspaces/${encodeSegment(workspaceName)}/projects/${encodeSegment(project)}/pages/${encodePath(resolvedPath)}`,
    );
    return mapReaderPage(page);
  } catch (error) {
    if (isNotFound(error)) return missingPage(project, resolvedPath);
    throw error;
  }
}

export async function searchMemory(q: string): Promise<{ hits: PageHit[] }> {
  if (demoMode) {
    const needle = q.trim().toLowerCase();
    const hits = needle
      ? searchHits.filter((hit) => `${hit.title} ${hit.snippet} ${hit.project}`.toLowerCase().includes(needle))
      : searchHits;
    return delayed({ hits });
  }
  const query = q.trim();
  if (!query) return { hits: [] };
  const hits = await apiGet<ApiSearchHit[]>(`/search?q=${encodeURIComponent(query)}&limit=20`);
  return { hits: hits.map(mapPageHit) };
}

export async function listApiScenarios(): Promise<{ scenarios: ApiScenario[] }> {
  return delayed({ scenarios: apiScenarios });
}

export async function listSearchResults(q: string): Promise<{ results: SearchResult[] }> {
  if (demoMode) {
    const needle = q.trim().toLowerCase();
    const results = needle
      ? searchResults.filter((result) =>
          `${result.title} ${result.detail} ${result.snippet ?? ""} ${result.project} ${result.path ?? ""} ${result.kind ?? ""} ${result.tier ?? ""}`
            .toLowerCase()
            .includes(needle),
        )
      : searchResults;
    return delayed({ results });
  }
  const [projectResp, searchResp] = await Promise.all([listProjects(), searchMemory(q)]);
  const projectResults: SearchResult[] = projectResp.projects
    .filter((project) => project.project_name.toLowerCase().includes(q.trim().toLowerCase()))
    .map((project) => ({
      detail: `${project.workspace_name} / ${project.page_count} pages`,
      id: `project:${project.workspace_name}:${project.project_name}`,
      project: project.project_name,
      title: project.project_name,
      type: "project",
      workspace: project.workspace_name,
    }));
  const hitResults = searchResp.hits.map<SearchResult>((hit) => ({
    detail: `${hit.project} / ${hit.path}`,
    id: `hit:${hit.project}:${hit.path}`,
    kind: "fact",
    path: hit.path,
    project: hit.project,
    rank: hit.rank,
    snippet: hit.snippet,
    title: hit.title,
    type: hit.path.toLowerCase().includes(q.trim().toLowerCase()) ? "path" : "content",
    workspace: hit.workspace,
  }));
  return { results: [...projectResults, ...hitResults] };
}

export async function listDriftIssues(): Promise<{ issues: MemoryDriftIssue[] }> {
  if (demoMode) return delayed({ issues: driftIssues });
  const overview = await apiGet<ApiOverview>(`/workspaces/${encodeSegment(workspaceName)}/overview?limit=50`);
  return {
    issues: [
      ...mapHealthIssues("stale", overview.health.stale_pages ?? []),
      ...mapHealthIssues("duplicate", overview.health.duplicate_pages ?? []),
      ...mapHealthIssues("orphan", overview.health.orphan_pages ?? []),
    ],
  };
}

export async function getProjectGraph(): Promise<{ edges: ProjectGraphEdge[] }> {
  if (demoMode) return delayed({ edges: projectGraph });
  const payload = await apiGet<{ edges: ApiGraphEdge[] }>("/graph");
  return { edges: aggregateGraphEdges(payload.edges ?? []) };
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(response.status, body.error ?? response.statusText);
  }
  return (await response.json()) as T;
}

function apiBase() {
  const basePath = document.querySelector('meta[name="ai-memory-base-path"]')?.getAttribute("content") ?? "";
  return `${basePath}/api/v1`;
}

function unwrapList<T>(payload: ApiList<T>, key: string): T[] {
  return Array.isArray(payload) ? payload : ((payload[key] as T[] | undefined) ?? []);
}

function mapProject(project: ApiProject, index: number): ProjectSummary {
  return {
    accent: ["cyan", "amber", "green", "rose"][index % 4] as ProjectSummary["accent"],
    activity: activityFor(project),
    last_updated: project.last_updated,
    page_count: project.page_count,
    project_name: project.project_name,
    workspace_name: project.workspace_name,
  };
}

function mapPageSummary(page: ApiPageSummary): PageSummary {
  return {
    kind: normalizeKind(page.kind),
    path: page.path,
    tier: normalizeTier(page.tier),
    title: page.title,
    updated_at: page.updated_at,
  };
}

function mapReaderPage(page: ApiReaderPage): ReaderPage {
  const frontmatter = page.frontmatter ?? {};
  return {
    ...mapPageSummary(page),
    backlinks: (page.backlinks ?? []).map((link) => ({
      context: `${link.project ?? page.project} / ${link.path}`,
      path: link.path,
      project: link.project ?? page.project,
      title: link.title,
    })),
    body: page.body_markdown ?? page.body ?? "",
    frontmatter: {
      pinned: Boolean(page.pinned ?? frontmatter.pinned),
      source: typeof frontmatter.source === "string" ? frontmatter.source : undefined,
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.filter((tag): tag is string => typeof tag === "string") : [],
    },
    links: (page.links ?? []).map((link) => ({
      kind: normalizeKind(link.kind),
      label: link.title,
      path: link.path,
      project: link.project ?? page.project,
      status: "resolved",
    })),
    project: page.project,
  };
}

function mapPageHit(hit: ApiSearchHit): PageHit {
  return {
    id: `${hit.workspace ?? workspaceName}:${hit.project ?? "unknown"}:${hit.path}`,
    path: hit.path,
    project: hit.project ?? "unknown",
    rank: hit.rank,
    snippet: hit.snippet,
    title: hit.title,
    workspace: hit.workspace ?? workspaceName,
  };
}

function normalizeBriefing(snapshot: BriefingSnapshot): BriefingSnapshot {
  return {
    ...snapshot,
    recent_pages: (snapshot.recent_pages ?? []).map(mapPageSummary),
    rules: (snapshot.rules ?? []).map(mapPageSummary),
  };
}

function mapHealthIssues(type: "stale" | "duplicate" | "orphan", pages: ApiRelatedPage[]): MemoryDriftIssue[] {
  const config = {
    duplicate: ["duplicate", "Near-duplicate page", "medium"] as const,
    orphan: ["orphan", "Orphan page with no inbound links", "low"] as const,
    stale: ["stale", "Stale page past freshness window", "medium"] as const,
  }[type];
  return pages.map((page) => ({
    action: "open-reader",
    explanation: config[1],
    id: `${type}:${page.project}:${page.path}`,
    path: page.path,
    project: page.project ?? "unknown",
    severity: config[2],
    title: page.title,
    type: config[0],
  }));
}

function aggregateGraphEdges(edges: ApiGraphEdge[]): ProjectGraphEdge[] {
  const grouped = new Map<string, ProjectGraphEdge>();
  for (const edge of edges) {
    if (!edge.from_project || !edge.to_project || edge.from_project === edge.to_project) continue;
    const key = `${edge.from_project}->${edge.to_project}`;
    const current =
      grouped.get(key) ??
      ({
        count: 0,
        from: edge.from_project,
        kinds: ["fact"],
        label: "wikilink",
        paths: [],
        to: edge.to_project,
      } satisfies ProjectGraphEdge);
    current.count += 1;
    current.paths.push(`${edge.from_path} -> ${edge.to_path}`);
    grouped.set(key, current);
  }
  return Array.from(grouped.values());
}

function activityFor(project: ApiProject): ProjectSummary["activity"] {
  if (project.page_count === 0) return "empty";
  if (!project.last_updated) return "quiet";
  const ageDays = (Date.now() - Date.parse(project.last_updated)) / 86_400_000;
  if (ageDays <= 2) return "active";
  if (ageDays <= 14) return "steady";
  return "quiet";
}

function normalizeKind(kind?: string): PageKind {
  return kind === "rule" || kind === "decision" || kind === "gotcha" ? kind : "fact";
}

function normalizeTier(tier?: string): PageSummary["tier"] {
  return tier === "working" || tier === "semantic" || tier === "procedural" ? tier : "episodic";
}

function encodeSegment(segment: string) {
  return encodeURIComponent(segment);
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function delayed<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
}
