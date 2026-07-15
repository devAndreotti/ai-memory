import { ExternalLink, GitBranch, Globe, LocateFixed, Minus, Network, Plus, RotateCcw, Search, Share2 } from "lucide-react";
import { useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import type { PageKind, ProjectGraphEdge, ProjectSummary } from "../types";

interface GraphNode {
  project: ProjectSummary;
  x: number;
  y: number;
  radius: number;
  degree: number;
}

interface ProjectGraphProps {
  projects: ProjectSummary[];
  edges: ProjectGraphEdge[];
  onOpenProject: (project: string) => void;
}

const canvasWidth = 1000;
const canvasHeight = 620;
const KIND_OPTIONS: PageKind[] = ["rule", "decision", "fact", "gotcha"];

export function ProjectGraph({ projects, edges, onOpenProject }: ProjectGraphProps) {
  const nodes = layoutNodes(projects, edges);
  const [selectedProject, setSelectedProject] = useState(nodes[0]?.project.project_name ?? "");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [mode, setMode] = useState<"local" | "global">("global");
  const [kindFilter, setKindFilter] = useState<Set<PageKind>>(new Set());
  const [search, setSearch] = useState("");
  const [activeEdge, setActiveEdge] = useState<ProjectGraphEdge | null>(null);

  const nodeByName = new Map(nodes.map((node) => [node.project.project_name, node]));
  const selectedNode = nodeByName.get(selectedProject) ?? nodes[0];

  const passesKind = (edge: ProjectGraphEdge) => kindFilter.size === 0 || edge.kinds.some((kind) => kindFilter.has(kind));
  const kindEdges = edges.filter(passesKind);
  const selectedEdges = kindEdges.filter((edge) => edge.from === selectedNode?.project.project_name || edge.to === selectedNode?.project.project_name);
  const neighborNames = new Set(selectedEdges.flatMap((edge) => [edge.from, edge.to]));
  if (selectedNode) neighborNames.add(selectedNode.project.project_name);

  const visibleEdges = mode === "local" ? selectedEdges : kindEdges;
  const visibleNodeNames = new Set(visibleEdges.flatMap((edge) => [edge.from, edge.to]));
  if (selectedNode) visibleNodeNames.add(selectedNode.project.project_name);

  const needle = search.trim().toLowerCase();
  const matches = needle ? nodes.filter((node) => node.project.project_name.toLowerCase().includes(needle)) : [];
  const matchNames = new Set(matches.map((node) => node.project.project_name));

  const renderedNodeCount = mode === "local" ? visibleNodeNames.size : nodes.length;
  const listEdges = selectedEdges.length ? selectedEdges : kindEdges;

  const zoomBy = (delta: number) => setZoom((value) => Math.min(1.7, Math.max(0.72, Number((value + delta).toFixed(2)))));
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const toggleKind = (kind: PageKind) =>
    setKindFilter((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const onCanvasPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
  };
  const onCanvasPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragStart) return;
    setPan({ x: dragStart.panX + event.clientX - dragStart.x, y: dragStart.panY + event.clientY - dragStart.y });
  };
  const onCanvasPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragStart(null);
  };

  return (
    <div className="graph-v2-view">
      <div className="graph-v2-controls">
        <div className="graph-v2-mode" role="group" aria-label="Graph scope">
          <button type="button" className={mode === "local" ? "is-active" : ""} aria-pressed={mode === "local"} onClick={() => setMode("local")}>
            <LocateFixed size={14} />
            Local
          </button>
          <button type="button" className={mode === "global" ? "is-active" : ""} aria-pressed={mode === "global"} onClick={() => setMode("global")}>
            <Globe size={14} />
            Global
          </button>
        </div>
        <div className="graph-v2-search">
          <Search size={15} />
          <input
            aria-label="Search graph"
            placeholder="Find a project…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches[0]) {
                event.preventDefault();
                setSelectedProject(matches[0].project.project_name);
              }
            }}
          />
          {needle && <span className="graph-v2-search-count">{matches.length} match{matches.length === 1 ? "" : "es"}</span>}
        </div>
        <div className="graph-v2-kinds" role="group" aria-label="Filter by page kind">
          <button type="button" className={kindFilter.size === 0 ? "is-active" : ""} aria-pressed={kindFilter.size === 0} onClick={() => setKindFilter(new Set())}>
            All
          </button>
          {KIND_OPTIONS.map((kind) => (
            <button type="button" key={kind} className={`kind-${kind} ${kindFilter.has(kind) ? "is-active" : ""}`} aria-pressed={kindFilter.has(kind)} onClick={() => toggleKind(kind)}>
              {kind}
            </button>
          ))}
        </div>
      </div>

      <div className="graph-v2-body">
        <section className="graph-v2-canvas-shell" aria-label="Project graph workspace">
          <div className="graph-v2-toolbar" aria-label="Graph controls">
            <button type="button" title="Zoom out" onClick={() => zoomBy(-0.12)}>
              <Minus size={16} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" title="Zoom in" onClick={() => zoomBy(0.12)}>
              <Plus size={16} />
            </button>
            <button type="button" title="Reset view" onClick={resetView}>
              <LocateFixed size={16} />
            </button>
          </div>

          <svg
            className={`graph-v2-canvas ${dragStart ? "is-panning" : ""}`}
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            role="img"
            aria-label="Cross-project wikilink graph"
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={() => setDragStart(null)}
          >
            <defs>
              <radialGradient id="graphNodeGlow">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.42" />
                <stop offset="70%" stopColor="currentColor" stopOpacity="0.12" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {visibleEdges.map((edge) => {
                const from = nodeByName.get(edge.from);
                const to = nodeByName.get(edge.to);
                if (!from || !to) return null;
                const active = selectedEdges.includes(edge);
                const hovered = activeEdge === edge;
                return (
                  <g
                    className={`graph-v2-edge-group ${active ? "is-active" : "is-muted"} ${hovered ? "is-hovered" : ""}`}
                    key={`${edge.from}-${edge.to}-${edge.label}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${edge.from} to ${edge.to}, ${edge.count} link${edge.count === 1 ? "" : "s"}`}
                    onMouseEnter={() => setActiveEdge(edge)}
                    onFocus={() => setActiveEdge(edge)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveEdge(edge);
                    }}
                  >
                    <path className="graph-v2-edge-hit" d={edgePath(from, to)} />
                    <path className="graph-v2-edge" d={edgePath(from, to)} />
                  </g>
                );
              })}

              {nodes.map((node) => {
                const name = node.project.project_name;
                if (mode === "local" && !visibleNodeNames.has(name)) return null;
                const selected = name === selectedNode?.project.project_name;
                const related = neighborNames.has(name);
                const isMatch = matchNames.has(name);
                return (
                  <g
                    className={`graph-v2-node ${selected ? "is-selected" : ""} ${related ? "is-related" : "is-muted"} ${isMatch ? "is-search-match" : ""}`}
                    key={name}
                    role="button"
                    tabIndex={0}
                    transform={`translate(${node.x} ${node.y})`}
                    style={{ "--node-color": accentColor(node.project.accent) } as CSSProperties}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedProject(name);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelectedProject(name);
                    }}
                  >
                    <circle className="graph-v2-node-glow" r={node.radius + 22} />
                    <circle className="graph-v2-node-core" r={node.radius} />
                    <Network className="graph-v2-node-icon" x={-12} y={-42} size={24} />
                    <text className="graph-v2-node-title" textAnchor="middle" y="5">
                      {shortName(name)}
                    </text>
                    <text className="graph-v2-node-meta" textAnchor="middle" y="30">
                      {node.project.page_count}p / {node.degree}l
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </section>

        <aside className="graph-v2-inspector">
          <div className="graph-v2-inspector-head">
            <span className="section-kicker">{mode} graph</span>
            <h2>{selectedNode?.project.project_name ?? "Project graph"}</h2>
            <p>{selectedNode ? `${selectedNode.project.page_count} pages, ${selectedEdges.length} cross-project links` : `${edges.length} links`}</p>
            {selectedNode && (
              <button className="small-action" type="button" onClick={() => onOpenProject(selectedNode.project.project_name)}>
                <ExternalLink size={15} />
                Open project
              </button>
            )}
          </div>

          <div className="graph-v2-stats">
            <div>
              <strong>{renderedNodeCount}</strong>
              <span>nodes</span>
            </div>
            <div>
              <strong>{visibleEdges.length}</strong>
              <span>links</span>
            </div>
            <div>
              <strong>{selectedEdges.length}</strong>
              <span>active</span>
            </div>
          </div>

          <div className="graph-v2-edge-detail" aria-live="polite">
            <div className="panel-title">
              <Share2 size={15} />
              <h3>Edge detail</h3>
            </div>
            {activeEdge ? (
              <>
                <p className="graph-v2-edge-detail-route">
                  <strong>{activeEdge.from}</strong> &gt; <strong>{activeEdge.to}</strong>
                </p>
                <p className="graph-v2-edge-detail-label">
                  {activeEdge.label} · {activeEdge.count} link{activeEdge.count === 1 ? "" : "s"} · {activeEdge.kinds.join(", ")}
                </p>
                <ul className="graph-v2-edge-detail-paths">
                  {activeEdge.paths.map((path) => (
                    <li key={path}>
                      <code>{path}</code>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="empty-note">Hover or focus an edge to see which pages link these projects.</p>
            )}
          </div>

          <div className="graph-v2-edge-list">
            {listEdges.map((edge) => (
              <button
                className={`graph-v2-edge-row ${activeEdge === edge ? "is-hovered" : ""}`}
                key={`${edge.from}-${edge.to}-${edge.label}`}
                type="button"
                onMouseEnter={() => setActiveEdge(edge)}
                onFocus={() => setActiveEdge(edge)}
                onClick={() => setSelectedProject(edge.to === selectedProject ? edge.from : edge.to)}
              >
                <span>
                  <GitBranch size={15} />
                  <strong>{edge.label}</strong>
                  <code>{edge.count}</code>
                </span>
                <small>
                  {edge.from} &gt; {edge.to}
                </small>
                <em>{edge.paths.join(", ")}</em>
              </button>
            ))}
          </div>

          <button className="graph-v2-reset" type="button" onClick={() => setSelectedProject(nodes[0]?.project.project_name ?? "")}>
            <RotateCcw size={15} />
            Reset focus
          </button>
        </aside>
      </div>
    </div>
  );
}

function layoutNodes(projects: ProjectSummary[], edges: ProjectGraphEdge[]): GraphNode[] {
  const connected = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const visible = projects.filter((project) => connected.has(project.project_name));
  const degreeByProject = new Map<string, number>();
  edges.forEach((edge) => {
    degreeByProject.set(edge.from, (degreeByProject.get(edge.from) ?? 0) + edge.count);
    degreeByProject.set(edge.to, (degreeByProject.get(edge.to) ?? 0) + edge.count);
  });

  return visible.map((project, index) => {
    const angle = (index / visible.length) * Math.PI * 2 - Math.PI / 2;
    const degree = degreeByProject.get(project.project_name) ?? 0;
    const radius = 42 + Math.min(16, project.page_count * 1.2 + degree * 2);
    const ringX = index % 2 === 0 ? 315 : 390;
    const ringY = index % 2 === 0 ? 190 : 220;
    return {
      project,
      degree,
      radius,
      x: Math.round(canvasWidth / 2 + Math.cos(angle) * ringX),
      y: Math.round(canvasHeight / 2 + Math.sin(angle) * ringY),
    };
  });
}

function edgePath(from: GraphNode, to: GraphNode) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const bend = Math.min(80, distance * 0.14);
  const controlX = midX - (dy / distance) * bend;
  const controlY = midY + (dx / distance) * bend;
  return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}

function accentColor(accent: ProjectSummary["accent"]) {
  if (accent === "amber") return "var(--amber)";
  if (accent === "green") return "var(--green)";
  if (accent === "rose") return "var(--rose)";
  return "var(--cyan)";
}

function shortName(name: string) {
  if (name.length <= 18) return name;
  return `${name.slice(0, 15)}...`;
}
