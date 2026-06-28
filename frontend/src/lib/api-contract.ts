import type { ApiScenario, BriefingSnapshot, MemoryDriftIssue, PageHit, PageSummary, ProjectGraphEdge, ProjectSummary, ReaderPage, SearchResult } from "../types";
import { apiScenarios, briefing, driftIssues, genericPage, missingPage, pageBodies, pageBody, pages, projectGraph, projects, searchHits, searchResults } from "../mocks/memory";

export async function listProjects(): Promise<{ projects: ProjectSummary[] }> {
  return delayed({ projects });
}

export async function getProjectBriefing(): Promise<BriefingSnapshot> {
  return delayed(briefing);
}

export async function listPages(project: string): Promise<{ pages: PageSummary[] }> {
  return delayed({ pages: pages[project] ?? [] });
}

export async function readPage(project = pageBody.project, path = pageBody.path): Promise<ReaderPage> {
  const key = `${project}/${path}`;
  const summary = pages[project]?.find((page) => page.path === path);
  return delayed(pageBodies[key] ?? (summary ? genericPage(project, summary) : missingPage(project, path || pageBody.path)));
}

export async function searchMemory(q: string): Promise<{ hits: PageHit[] }> {
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? searchHits.filter((hit) => `${hit.title} ${hit.snippet} ${hit.project}`.toLowerCase().includes(needle))
    : searchHits;
  return delayed({ hits });
}

export async function listApiScenarios(): Promise<{ scenarios: ApiScenario[] }> {
  return delayed({ scenarios: apiScenarios });
}

export async function listSearchResults(q: string): Promise<{ results: SearchResult[] }> {
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

export async function listDriftIssues(): Promise<{ issues: MemoryDriftIssue[] }> {
  return delayed({ issues: driftIssues });
}

export async function getProjectGraph(): Promise<{ edges: ProjectGraphEdge[] }> {
  return delayed({ edges: projectGraph });
}

function delayed<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
}
