import { Command, FileText, FolderOpen, Search, Server } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PageHit, PageSummary, ProjectSummary, View } from "../types";

export interface PaletteTarget {
  view: View;
  project?: string;
  path?: string;
  query?: string;
}

interface PaletteItem {
  id: string;
  type: "workspace" | "project" | "page" | "path" | "search";
  title: string;
  subtitle: string;
  keywords: string;
  target: PaletteTarget;
}

interface CommandPaletteProps {
  open: boolean;
  projects: ProjectSummary[];
  pagesByProject: Record<string, PageSummary[]>;
  hits: PageHit[];
  onOpenChange: (open: boolean) => void;
  onNavigate: (target: PaletteTarget) => void;
}

export function CommandPalette({ open, projects, pagesByProject, hits, onOpenChange, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingEnterQuery = useRef<string | null>(null);
  const items = buildItems(projects, pagesByProject, hits);
  const latestState = useRef({ activeIndex: 0, items, query: "" });
  const filtered = filterItems(items, query).slice(0, 12);

  const selectActive = (queryOverride = query) => {
    const currentFiltered = filterItems(latestState.current.items, queryOverride).slice(0, 12);
    const item = currentFiltered[latestState.current.activeIndex] ?? currentFiltered[0];
    if (!item) {
      pendingEnterQuery.current = queryOverride.trim() ? queryOverride : null;
      return;
    }
    pendingEnterQuery.current = null;
    onNavigate(item.target);
    onOpenChange(false);
  };

  useEffect(() => {
    latestState.current = { activeIndex, items, query };
  }, [activeIndex, items, query]);

  useEffect(() => {
    if (!open || !pendingEnterQuery.current) return;
    const currentFiltered = filterItems(items, pendingEnterQuery.current).slice(0, 12);
    const item = currentFiltered[activeIndex] ?? currentFiltered[0];
    if (!item) return;
    pendingEnterQuery.current = null;
    onNavigate(item.target);
    onOpenChange(false);
  }, [activeIndex, items, onNavigate, onOpenChange, open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.defaultPrevented) return;
      event.preventDefault();
      selectActive(inputRef.current?.value ?? latestState.current.query);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={() => onOpenChange(false)}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-search">
          <Command size={18} />
          <input
            ref={inputRef}
            aria-label="Search pages, projects, workspaces, and paths"
            placeholder="Search page, project, workspace, or path..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onOpenChange(false);
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                selectActive(event.currentTarget.value);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="palette-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="palette-empty">
              <Search size={18} />
              <span>No command found</span>
            </div>
          ) : (
            filtered.map((item, index) => (
              <button
                className={`palette-item ${index === activeIndex ? "is-active" : ""}`}
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onNavigate(item.target);
                  onOpenChange(false);
                }}
              >
                <span className={`palette-icon palette-kind-${item.type}`}>{iconFor(item.type)}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </span>
                <code>{item.type}</code>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function buildItems(projects: ProjectSummary[], pagesByProject: Record<string, PageSummary[]>, hits: PageHit[]): PaletteItem[] {
  const workspaces = Array.from(new Set(projects.map((project) => project.workspace_name)));
  const workspaceItems: PaletteItem[] = workspaces.map((workspace) => ({
    id: `workspace:${workspace}`,
    type: "workspace",
    title: workspace,
    subtitle: "Workspace overview",
    keywords: workspace,
    target: { view: "home" },
  }));

  const projectItems: PaletteItem[] = projects.map((project) => ({
    id: `project:${project.project_name}`,
    type: "project",
    title: project.project_name,
    subtitle: `${project.workspace_name} / ${project.page_count} pages`,
    keywords: `${project.workspace_name} ${project.project_name} ${project.activity}`,
    target: { view: "project", project: project.project_name },
  }));

  const pageItems: PaletteItem[] = Object.entries(pagesByProject).flatMap(([project, pages]) =>
    pages.map((page) => ({
      id: `page:${project}:${page.path}`,
      type: page.path.includes("/") ? "path" : "page",
      title: page.title,
      subtitle: `${project} / ${page.path}`,
      keywords: `${project} ${page.path} ${page.title} ${page.kind} ${page.tier}`,
      target: { view: "page", project, path: page.path },
    })),
  );

  const hitItems: PaletteItem[] = hits.map((hit) => ({
    id: `hit:${hit.id}`,
    type: "search",
    title: hit.title,
    subtitle: `${hit.project} / ${hit.path}`,
    keywords: `${hit.workspace} ${hit.project} ${hit.path} ${hit.title}`,
    target: { view: "page", project: hit.project, path: hit.path },
  }));

  return [...workspaceItems, ...projectItems, ...pageItems, ...hitItems];
}

function filterItems(items: PaletteItem[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase().includes(needle));
}

function iconFor(type: PaletteItem["type"]) {
  if (type === "workspace") return <Server size={16} />;
  if (type === "project") return <FolderOpen size={16} />;
  if (type === "search") return <Search size={16} />;
  return <FileText size={16} />;
}
