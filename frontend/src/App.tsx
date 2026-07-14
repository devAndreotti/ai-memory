import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  Boxes,
  Clock3,
  Command,
  Database,
  FileText,
  Gauge,
  GitBranch,
  History,
  Loader2,
  LucideIcon,
  Network,
  Pin,
  PinOff,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CommandPalette, type PaletteTarget } from "./components/CommandPalette";
import { DriftAudit } from "./components/DriftAudit";
import { ProjectGraph } from "./components/ProjectGraph";
import { headingId, ReaderEnhancements } from "./components/ReaderEnhancements";
import { ReaderAgentView, ReaderModeSwitch, type ReaderMode } from "./components/ReaderModeSwitch";
import { SearchExplorer } from "./components/SearchExplorer";
import {
  getProjectBriefing,
  getProjectGraph,
  getMemoryHealth,
  listDriftIssues,
  listPages,
  listProjects,
  listSearchResults,
  readPage,
  searchMemory,
} from "./lib/api-contract";
import type {
  BriefingSnapshot,
  MemoryHealth,
  MemoryDriftIssue,
  PageHit,
  PageKind,
  PageSummary,
  ProjectGraphEdge,
  ProjectSummary,
  ReaderLink,
  ReaderPage,
  SearchResult,
  View,
} from "./types";

// Neutral defaults: the app boots on the Home view and lets the first
// real project (loaded from /api/v1) drive selection, rather than shipping
// one developer's personal project/query baked into the bundle.
const primaryProject = "";
const primaryPage = "";
const pinnedStorageKey = "ai-memory:pinned-projects";
const defaultPinnedProjects: string[] = [];

export default function App() {
  const [view, setView] = useState<View>("home");
  const [selectedProject, setSelectedProject] = useState(primaryProject);
  const [selectedPagePath, setSelectedPagePath] = useState(primaryPage);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [briefing, setBriefing] = useState<BriefingSnapshot | null>(null);
  const [memoryHealth, setMemoryHealth] = useState<MemoryHealth | null>(null);
  const [projectPages, setProjectPages] = useState<PageSummary[]>([]);
  const [pagesByProject, setPagesByProject] = useState<Record<string, PageSummary[]>>({});
  const [hits, setHits] = useState<PageHit[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [page, setPage] = useState<ReaderPage | null>(null);
  const [graphEdges, setGraphEdges] = useState<ProjectGraphEdge[]>([]);
  const [driftIssues, setDriftIssues] = useState<MemoryDriftIssue[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pinnedProjectNames, setPinnedProjectNames] = useState<string[]>(() => {
    const saved = window.localStorage.getItem(pinnedStorageKey);
    if (!saved) return defaultPinnedProjects;
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : defaultPinnedProjects;
    } catch {
      return defaultPinnedProjects;
    }
  });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    async function load() {
      const [projectResp, briefingResp, healthResp, pageResp, searchResp, searchResultsResp, graphResp, driftResp] = await Promise.all([
        listProjects(),
        getProjectBriefing(),
        getMemoryHealth(),
        readPage(selectedProject, selectedPagePath || undefined),
        searchMemory(query),
        listSearchResults(query),
        getProjectGraph(),
        listDriftIssues(),
      ]);
      const pageEntries = await Promise.all(
        projectResp.projects.map(async (project) => [project.project_name, (await listPages(project.project_name)).pages] as const),
      );
      if (!alive) return;
      const nextPagesByProject = Object.fromEntries(pageEntries);
      setProjects(projectResp.projects);
      setBriefing(briefingResp);
      setMemoryHealth(healthResp);
      setProjectPages(nextPagesByProject[selectedProject] ?? []);
      setPagesByProject(nextPagesByProject);
      setPage(pageResp);
      setHits(searchResp.hits);
      setSearchResults(searchResultsResp.results);
      setGraphEdges(graphResp.edges);
      setDriftIssues(driftResp.issues);
      setLoading(false);
    }
    load().catch(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [selectedProject, selectedPagePath, query]);

  // Once real projects load, adopt the first one if nothing is selected yet
  // (neutral defaults boot empty). Keeps Reader/Project views from opening
  // on an empty selection without hardcoding a project name.
  useEffect(() => {
    if (!selectedProject && projects.length > 0) {
      setSelectedProject(projects[0].project_name);
    }
  }, [projects, selectedProject]);

  const openProject = (projectName: string) => {
    setSelectedProject(projectName);
    setSelectedPagePath(pagesByProject[projectName]?.[0]?.path ?? "");
    setView("project");
  };

  const openPage = (projectName = selectedProject, path = selectedPagePath || primaryPage) => {
    setSelectedProject(projectName);
    setSelectedPagePath(path);
    setView("page");
  };

  const openReaderLink = (link: ReaderLink) => openPage(link.project, link.path);

  const projectForPath = (path: string) => {
    return Object.entries(pagesByProject).find(([, pages]) => pages.some((page) => page.path === path))?.[0] ?? selectedProject;
  };

  const togglePinnedProject = (projectName: string) => {
    setPinnedProjectNames((current) => {
      const next = current.includes(projectName) ? current.filter((item) => item !== projectName) : [projectName, ...current];
      window.localStorage.setItem(pinnedStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const navigateFromPalette = (target: PaletteTarget) => {
    if (target.query) setQuery(target.query);
    if (target.view === "project" && target.project) return openProject(target.project);
    if (target.view === "page") return openPage(target.project ?? selectedProject, target.path ?? selectedPagePath);
    setView(target.view);
  };

  return (
    <div className="app-shell">
      <CommandPalette open={paletteOpen} projects={projects} pagesByProject={pagesByProject} hits={hits} onOpenChange={setPaletteOpen} onNavigate={navigateFromPalette} />

      <aside className="sidebar" aria-label="Workspace navigation">
        <button className="brand" type="button" onClick={() => setView("home")} title="Home">
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span>
            <strong>ai-memory</strong>
            <small>read-only cockpit</small>
          </span>
        </button>

        <nav className="nav-stack">
          <NavButton active={view === "home"} icon={Boxes} label="Projects" onClick={() => setView("home")} />
          <NavButton active={view === "search"} icon={Search} label="Search" onClick={() => setView("search")} />
          <NavButton active={view === "page"} icon={BookOpenText} label="Reader" onClick={() => setView("page")} />
          <NavButton active={view === "graph"} icon={Network} label="Graph" onClick={() => setView("graph")} />
          <NavButton active={view === "states"} icon={Gauge} label="Status" onClick={() => setView("states")} />
          <NavButton active={view === "audit"} icon={ShieldAlert} label="Audit" onClick={() => setView("audit")} />
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-label">Pinned projects</div>
          {projects.filter((project) => pinnedProjectNames.includes(project.project_name)).length === 0 ? (
            <div className="empty-note">No pinned projects.</div>
          ) : (
            projects
              .filter((project) => pinnedProjectNames.includes(project.project_name))
              .map((project) => (
                <div className={`project-pill ${selectedProject === project.project_name ? "is-selected" : ""}`} key={project.project_name}>
                  <button className="project-pill-main" type="button" onClick={() => openProject(project.project_name)}>
                    <span className={`dot dot-${project.accent}`} />
                    <span>{project.project_name}</span>
                    <small>{project.page_count}</small>
                  </button>
                  <button className="pin-toggle" type="button" title={`Unpin ${project.project_name}`} onClick={() => togglePinnedProject(project.project_name)}>
                    <PinOff size={14} />
                  </button>
                </div>
              ))
          )}
        </div>

        <div className="sidebar-footer">
          <span>default</span>
          <strong>{projects.length || 0} projects</strong>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="section-kicker">default workspace</p>
            <h1>{titleFor(view, selectedProject)}</h1>
          </div>
          <form
            className="command-bar"
            onSubmit={(event) => {
              event.preventDefault();
              setView("search");
            }}
          >
            <Search size={18} />
            <input aria-label="Search memory" value={query} onChange={(event) => setQuery(event.target.value)} />
            <button type="button" title="Open command palette" onClick={() => setPaletteOpen(true)}>
              <Command size={16} />
            </button>
          </form>
        </header>

        {loading && <LoadingOverlay />}

        {!loading && view === "home" && briefing && (
          <HomeView
            briefing={briefing}
            health={memoryHealth}
            projects={projects}
            pinnedProjectNames={pinnedProjectNames}
            onOpenProject={openProject}
            onOpenPage={(item) => openPage(projectForPath(item.path), item.path)}
            onOpenGraph={() => setView("graph")}
            onTogglePinnedProject={togglePinnedProject}
          />
        )}

        {!loading && view === "project" && (
          <ProjectView
            project={projects.find((item) => item.project_name === selectedProject)}
            pages={projectPages}
            pinned={pinnedProjectNames.includes(selectedProject)}
            onBack={() => setView("home")}
            onOpenPage={(item) => openPage(selectedProject, item.path)}
            onTogglePinned={() => togglePinnedProject(selectedProject)}
          />
        )}

        {!loading && view === "page" && page && <PageReader page={page} onBack={() => setView("project")} onOpenLink={openReaderLink} />}

        {!loading && view === "search" && (
          <SearchExplorer
            query={query}
            results={searchResults}
            onOpenProject={openProject}
            onOpenResult={(result) => openPage(result.project, result.path ?? selectedPagePath)}
          />
        )}

        {!loading && view === "states" && briefing && (
          <StatusView
            briefing={briefing}
            health={memoryHealth}
            projects={projects}
            driftIssues={driftIssues}
            pagesByProject={pagesByProject}
            onOpenProject={openProject}
            onOpenPage={(item) => openPage(projectForPath(item.path), item.path)}
          />
        )}

        {!loading && view === "graph" && <ProjectGraph projects={projects} edges={graphEdges} onOpenProject={openProject} />}

        {!loading && view === "audit" && (
          <DriftAudit
            issues={driftIssues}
            onOpenProject={openProject}
            onOpenPage={(project, path) => openPage(project, path)}
          />
        )}
      </main>
    </div>
  );
}

const KIND_TONE: Record<PageKind, string> = {
  rule: "var(--cyan)",
  decision: "var(--amber)",
  gotcha: "var(--rose)",
  fact: "var(--green)",
};

function StatusBars({ rows }: { rows: { label: string; value: number; tone?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="status-bars">
      {rows.map((row) => (
        <div className="status-bar-row" key={row.label}>
          <span className="status-bar-label" title={row.label}>
            {row.label}
          </span>
          <span className="status-bar-track">
            <span
              className="status-bar-fill"
              style={{ width: `${Math.round((row.value / max) * 100)}%`, background: row.tone ?? "var(--cyan)" }}
            />
          </span>
          <span className="status-bar-value">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function StatusView({
  briefing,
  health,
  projects,
  driftIssues,
  pagesByProject,
  onOpenProject,
  onOpenPage,
}: {
  briefing: BriefingSnapshot;
  health: MemoryHealth | null;
  projects: ProjectSummary[];
  driftIssues: MemoryDriftIssue[];
  pagesByProject: Record<string, PageSummary[]>;
  onOpenProject: (project: string) => void;
  onOpenPage: (page: PageSummary) => void;
}) {
  const totalPages = projects.reduce((sum, p) => sum + p.page_count, 0);
  const emptyProjects = projects.filter((p) => p.page_count === 0).length;
  const missingOnDisk = driftIssues.filter((i) => i.type === "missing-page").length;
  const lastActivity = briefing.last_observation_at
    ? new Date(briefing.last_observation_at).toLocaleString()
    : "no activity recorded";

  const projectRows = [...projects]
    .filter((p) => p.page_count > 0)
    .sort((a, b) => b.page_count - a.page_count)
    .slice(0, 8)
    .map((p) => ({ label: p.project_name, value: p.page_count }));

  const kindCounts: Record<PageKind, number> = { rule: 0, decision: 0, fact: 0, gotcha: 0 };
  for (const pages of Object.values(pagesByProject)) {
    for (const page of pages) kindCounts[page.kind] = (kindCounts[page.kind] ?? 0) + 1;
  }
  const kindRows = (Object.keys(kindCounts) as PageKind[])
    .map((kind) => ({ label: kind, value: kindCounts[kind], tone: KIND_TONE[kind] }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="dashboard-grid">
      <section className="metrics-strip" aria-label="Server status metrics">
        <Metric icon={FileText} label="Latest pages" value={briefing.counts.pages_latest.toString()} tone="cyan" />
        <Metric icon={Database} label="All versions" value={briefing.counts.pages_all.toString()} tone="green" />
        <Metric icon={History} label="Sessions" value={briefing.counts.sessions.toString()} tone="amber" />
        <Metric icon={ShieldCheck} label="Open handoffs" value={briefing.pending_handoff_count.toString()} tone="rose" />
      </section>

      <section className="status-main">
        <Panel title="Pages by project" icon={Boxes}>
          {projectRows.length > 0 ? (
            <button className="status-clickable-bars" type="button" onClick={() => onOpenProject(projectRows[0].label)}>
              <StatusBars rows={projectRows} />
            </button>
          ) : (
            <p className="status-freshness">No pages stored yet.</p>
          )}
        </Panel>

        <Panel title="Pages by kind" icon={Gauge}>
          <StatusBars rows={kindRows} />
        </Panel>

        <Panel title="Recent activity" icon={Clock3}>
          <div className="timeline">
            {briefing.recent_pages.length > 0 ? (
              briefing.recent_pages.map((item) => (
                <button className="timeline-item" key={`${item.path}-${item.title}`} type="button" onClick={() => onOpenPage(item)}>
                  <span className={`kind-chip kind-${item.kind}`}>{item.kind}</span>
                  <strong>{item.title}</strong>
                  <small>{item.path}</small>
                </button>
              ))
            ) : (
              <p className="status-freshness">No recent pages.</p>
            )}
          </div>
        </Panel>
      </section>

      <aside className="side-rail">
        <Panel title="Last 7 days" icon={Clock3}>
          <div className="quality-grid">
            <QualityCell label="Pages updated" value={briefing.activity_7d.pages_updated} />
            <QualityCell label="Sessions" value={briefing.activity_7d.sessions} />
            <QualityCell label="Observations" value={briefing.activity_7d.observations} />
          </div>
        </Panel>

        <Panel title="Storage" icon={Boxes}>
          <div className="quality-grid">
            <QualityCell label="Projects" value={projects.length} />
            <QualityCell label="Total pages" value={totalPages} />
            <QualityCell label="Empty projects" value={emptyProjects} />
          </div>
        </Panel>

        <Panel title="Integrity" icon={ShieldAlert}>
          <div className="quality-grid">
            <QualityCell label="Missing on disk" value={missingOnDisk} />
            <QualityCell label="Duplicate" value={health?.duplicate_count ?? 0} />
            <QualityCell label="Orphan" value={health?.orphan_count ?? 0} />
          </div>
        </Panel>

        <Panel title="Freshness" icon={Clock3}>
          <p className="status-freshness">
            Last recorded activity: <strong>{lastActivity}</strong>
          </p>
        </Panel>
      </aside>
    </div>
  );
}

function HomeView({
  briefing,
  health,
  projects,
  pinnedProjectNames,
  onOpenProject,
  onOpenPage,
  onOpenGraph,
  onTogglePinnedProject,
}: {
  briefing: BriefingSnapshot;
  health: MemoryHealth | null;
  projects: ProjectSummary[];
  pinnedProjectNames: string[];
  onOpenProject: (project: string) => void;
  onOpenPage: (page: PageSummary) => void;
  onOpenGraph: () => void;
  onTogglePinnedProject: (project: string) => void;
}) {
  return (
    <div className="dashboard-grid">
      <section className="metrics-strip" aria-label="Memory metrics">
        <Metric icon={FileText} label="Latest pages" value={briefing.counts.pages_latest.toString()} tone="cyan" />
        <Metric icon={History} label="Sessions" value={briefing.counts.sessions.toString()} tone="amber" />
        <Metric icon={Database} label="Observations" value={briefing.counts.observations.toString()} tone="green" />
        <Metric icon={ShieldCheck} label="Open handoffs" value={briefing.pending_handoff_count.toString()} tone="rose" />
      </section>

      <section className="project-wall">
        <div className="section-head">
          <div>
            <p className="section-kicker">project map</p>
            <h2>Memory buckets</h2>
          </div>
          <button className="small-action" type="button" onClick={onOpenGraph}>
            <Network size={15} />
            Open graph
          </button>
        </div>
        <div className="project-grid">
          {projects.map((project) => (
            <article
              className={`project-card accent-${project.accent}`}
              key={project.project_name}
            >
              <div className="project-card-top">
                <small>{project.workspace_name}</small>
                <button
                  className={`pin-toggle ${pinnedProjectNames.includes(project.project_name) ? "is-pinned" : ""}`}
                  type="button"
                  title={`${pinnedProjectNames.includes(project.project_name) ? "Unpin" : "Pin"} ${project.project_name}`}
                  onClick={() => onTogglePinnedProject(project.project_name)}
                >
                  {pinnedProjectNames.includes(project.project_name) ? <PinOff size={15} /> : <Pin size={15} />}
                </button>
              </div>
              <button className="project-card-main" type="button" onClick={() => onOpenProject(project.project_name)}>
                <strong>{project.project_name}</strong>
                <span className="project-meta">
                  <span>{project.page_count} pages</span>
                  <span>{project.activity}</span>
                </span>
                <span className="activity-line" />
              </button>
            </article>
          ))}
        </div>
      </section>

      <aside className="side-rail">
        <Panel title="Memory quality" icon={Gauge}>
          <div className="quality-grid">
            <QualityCell label="Stale" value={health?.stale_count ?? 0} />
            <QualityCell label="Duplicate" value={health?.duplicate_count ?? 0} />
            <QualityCell label="Orphan" value={health?.orphan_count ?? 0} />
          </div>
        </Panel>
        <Panel title="Recent memory" icon={Clock3}>
          <div className="timeline">
            {briefing.recent_pages.map((item) => (
              <button className="timeline-item" key={item.path} type="button" onClick={() => onOpenPage(item)}>
                <span className={`kind-chip kind-${item.kind}`}>{item.kind}</span>
                <strong>{item.title}</strong>
                <small>{item.path}</small>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Rules" icon={ShieldCheck}>
          <div className="rule-stack">
            {briefing.rules.map((item) => (
              <button className="rule-row" key={item.path} type="button" onClick={() => onOpenPage(item)}>
                <GitBranch size={15} />
                <span>{item.title}</span>
              </button>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function ProjectView({
  project,
  pages,
  pinned,
  onBack,
  onOpenPage,
  onTogglePinned,
}: {
  project?: ProjectSummary;
  pages: PageSummary[];
  pinned: boolean;
  onBack: () => void;
  onOpenPage: (page: PageSummary) => void;
  onTogglePinned: () => void;
}) {
  if (!project) {
    return <StatePanel icon={AlertTriangle} title="Project missing" body="This mock project is not present in the current fixture." tone="error" />;
  }

  return (
    <div className="content-flow">
      <button className="text-command" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        Projects
      </button>
      <section className="project-hero">
        <div>
          <p className="section-kicker">{project.workspace_name}</p>
          <h2>{project.project_name}</h2>
        </div>
        <div className="project-hero-metrics">
          <button className={`small-action pin-action ${pinned ? "is-pinned" : ""}`} type="button" onClick={onTogglePinned}>
            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
            {pinned ? "Unpin" : "Pin"}
          </button>
          <Metric icon={FileText} label="Pages" value={project.page_count.toString()} tone={project.accent} />
          <Metric icon={Clock3} label="Activity" value={project.activity} tone="amber" />
        </div>
      </section>
      <section className="table-panel">
        <div className="section-head">
          <div>
            <p className="section-kicker">latest pages</p>
            <h2>Project index</h2>
          </div>
          <span>{pages.length} rows</span>
        </div>
        <div className="page-table" role="table" aria-label="Project pages">
          <div className="page-row table-head" role="row">
            <span>Title</span>
            <span>Kind</span>
            <span>Tier</span>
            <span>Path</span>
          </div>
          {pages.length === 0 ? (
            <StatePanel icon={FileText} title="Empty project" body="Project exists, but no latest pages are indexed yet." tone="empty" />
          ) : (
            pages.map((item) => (
              <button className="page-row" key={item.path} type="button" role="row" onClick={() => onOpenPage(item)}>
                <strong>{item.title}</strong>
                <span className={`kind-chip kind-${item.kind}`}>{item.kind}</span>
                <span>{item.tier}</span>
                <code>{item.path}</code>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function PageReader({ page, onBack, onOpenLink }: { page: ReaderPage; onBack: () => void; onOpenLink: (link: ReaderLink) => void }) {
  const [mode, setMode] = useState<ReaderMode>("human");
  return (
    <div className={`reader-layout ${page.missing ? "is-missing" : ""}`}>
      <article className="reader">
        <button className="text-command" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Project
        </button>
        {page.missing && <StatePanel icon={AlertTriangle} title="Page missing on disk" body="Index found this path, but mock disk read returned 404." tone="error" />}
        <div className="reader-head">
          <div>
            <p className="section-kicker">{page.project}</p>
            <div className="reader-title-line">
              <h2>{page.title}</h2>
              <span className={`kind-chip reader-kind-chip kind-${page.kind}`}>{page.kind}</span>
            </div>
            <code>{page.path}</code>
          </div>
          <ReaderModeSwitch mode={mode} onChange={setMode} />
        </div>
        {mode === "agent" ? <ReaderAgentView page={page} onOpenLink={onOpenLink} /> : <Markdown body={page.body} onOpenLink={onOpenLink} />}
      </article>
      <ReaderEnhancements page={page} onOpenLink={onOpenLink} />
    </div>
  );
}

function NavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`nav-button ${active ? "is-active" : ""}`} type="button" onClick={onClick}>
      <Icon size={17} />
      <span>{label}</span>
    </button>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return (
    <div className={`metric tone-${tone}`}>
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <Icon size={16} />
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function QualityCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="quality-cell">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function StatePanel({ icon: Icon, title, body, tone }: { icon: LucideIcon; title: string; body: string; tone: string }) {
  return (
    <section className={`state-panel state-${tone}`}>
      <Icon size={24} />
      <strong>{title}</strong>
      <span>{body}</span>
    </section>
  );
}

function LoadingOverlay() {
  return (
    <div className="loading-shell">
      <Loader2 size={24} />
      <span>Loading memory cockpit</span>
    </div>
  );
}

function Markdown({ body, onOpenLink }: { body: string; onOpenLink: (link: ReaderLink) => void }) {
  return (
    <div className="markdown">
      {body.split("\n").map((line, index) => {
        if (line.startsWith("# ")) return <h1 key={index}>{line.slice(2)}</h1>;
        if (line.startsWith("## ")) {
          const text = line.slice(3);
          return (
            <h2 id={headingId(text)} key={index}>
              {text}
            </h2>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <p className="markdown-list-item" key={index}>
              {renderInline(line.slice(2), onOpenLink)}
            </p>
          );
        }
        if (!line.trim()) return <br key={index} />;
        return <p key={index}>{renderInline(line, onOpenLink)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string, onOpenLink: (link: ReaderLink) => void) {
  const parts: React.ReactNode[] = [];
  const pattern = /\[\[([^/\]]+)\/([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const project = match[1];
    const path = match[2];
    const label = match[3] ?? `${project}/${path}`;
    parts.push(
      <button className="inline-wikilink" key={`${match.index}-${project}-${path}`} type="button" onClick={() => onOpenLink({ label, project, path, status: "resolved" })}>
        {label}
      </button>,
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length ? parts : text;
}

function titleFor(view: View, project: string) {
  if (view === "project") return project;
  if (view === "page") return "Page reader";
  if (view === "search") return "Search memory";
  if (view === "states") return "Server status";
  if (view === "graph") return "Project graph";
  if (view === "audit") return "Memory audit";
  return "Projects";
}
