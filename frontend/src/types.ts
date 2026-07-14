export type View = "home" | "project" | "page" | "search" | "states" | "graph" | "audit";

export type PageKind = "rule" | "decision" | "fact" | "gotcha";

export type MemoryTier = "working" | "episodic" | "semantic" | "procedural";

export interface ProjectSummary {
  workspace_name: string;
  project_name: string;
  page_count: number;
  last_updated: string | null;
  activity: "active" | "steady" | "quiet" | "empty";
  accent: "cyan" | "amber" | "green" | "rose";
}

export interface PageSummary {
  path: string;
  title: string;
  kind: PageKind;
  tier: MemoryTier;
  updated_at: string;
}

export interface PageHit {
  id: string;
  workspace: string;
  project: string;
  path: string;
  title: string;
  snippet: string;
  rank: number;
}

export type SearchResultType = "project" | "page" | "path" | "content";

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  detail: string;
  workspace: string;
  project: string;
  path?: string;
  kind?: PageKind;
  tier?: MemoryTier;
  snippet?: string;
  rank?: number;
}

export interface ReaderLink {
  label: string;
  project: string;
  path: string;
  status: "resolved" | "missing";
  kind?: PageKind;
}

export interface ReaderBacklink {
  title: string;
  project: string;
  path: string;
  context: string;
}

export interface ReaderPage extends PageSummary {
  project: string;
  frontmatter: {
    tags: string[];
    pinned: boolean;
    source?: string;
  };
  body: string;
  links: ReaderLink[];
  backlinks: ReaderBacklink[];
  retrieval_hint?: string;
  missing?: boolean;
}

export interface BriefingSnapshot {
  counts: {
    pages_latest: number;
    pages_all: number;
    sessions: number;
    observations: number;
  };
  activity_7d: {
    sessions: number;
    observations: number;
    pages_updated: number;
  };
  pending_handoff_count: number;
  last_observation_at?: string | null;
  rules: PageSummary[];
  recent_pages: PageSummary[];
}

export interface MemoryHealth {
  stale_count: number;
  duplicate_count: number;
  orphan_count: number;
}

export interface Handoff {
  agent: string;
  at: string;
  project: string;
  summary: string;
  open_questions: string[];
  next_steps: string[];
}

export type ApiScenarioTone = "auth" | "offline" | "empty" | "missing" | "loading";

export interface ApiScenario {
  id: string;
  title: string;
  status: string;
  code: string;
  body: string;
  recovery: string;
  tone: ApiScenarioTone;
  checklist: string[];
}

export type DriftIssueType =
  | "missing-page"
  | "empty-project"
  | "orphan"
  | "broken-backlink"
  | "duplicate"
  | "stale";

export type DriftSeverity = "high" | "medium" | "low";

export type DriftActionKind = "open-reader" | "open-project" | "copy-path" | "mark-reviewed";

export interface MemoryDriftIssue {
  id: string;
  type: DriftIssueType;
  severity: DriftSeverity;
  project: string;
  path: string;
  title: string;
  explanation: string;
  action: DriftActionKind;
}

export interface ProjectGraphEdge {
  from: string;
  to: string;
  label: string;
  count: number;
  paths: string[];
  kinds: PageKind[];
}
