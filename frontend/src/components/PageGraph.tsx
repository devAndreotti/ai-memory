import { ExternalLink, GitBranch, LocateFixed, Minus, Network, Plus, RotateCcw, Search, Share2 } from "lucide-react";
import { useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import type { PageGraphEdge, PageKind, PageSummary } from "../types";
import { type CircularNode, edgePath as bezierEdgePath, graphCanvasHeight, graphCanvasWidth, layoutCircular } from "../lib/graph-layout";

type GraphNode = CircularNode<PageSummary>;

interface PageGraphProps {
  project: string;
  pages: PageSummary[];
  edges: PageGraphEdge[];
  onOpenPage: (project: string, path: string) => void;
}

const canvasWidth = graphCanvasWidth;
const canvasHeight = graphCanvasHeight;
const KIND_OPTIONS: PageKind[] = ["rule", "decision", "fact", "gotcha"];

export function PageGraph({ project, pages, edges, onOpenPage }: PageGraphProps) {
  const nodes = layoutNodes(pages, edges);
  const [selectedPath, setSelectedPath] = useState(nodes[0]?.item.path ?? "");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [kindFilter, setKindFilter] = useState<Set<PageKind>>(new Set());
  const [search, setSearch] = useState("");
  const [activeEdge, setActiveEdge] = useState<PageGraphEdge | null>(null);

  const nodeByPath = new Map(nodes.map((node) => [node.item.path, node]));
  const selectedNode = nodeByPath.get(selectedPath) ?? nodes[0];

  const passesKind = (edge: PageGraphEdge) => {
    if (kindFilter.size === 0) return true;
    const from = nodeByPath.get(edge.from);
    const to = nodeByPath.get(edge.to);
    return (from && kindFilter.has(from.item.kind)) || (to && kindFilter.has(to.item.kind));
  };
  const kindEdges = edges.filter(passesKind);
  const selectedEdges = kindEdges.filter((edge) => edge.from === selectedNode?.item.path || edge.to === selectedNode?.item.path);
  const neighborPaths = new Set(selectedEdges.flatMap((edge) => [edge.from, edge.to]));
  if (selectedNode) neighborPaths.add(selectedNode.item.path);

  const needle = search.trim().toLowerCase();
  const matches = needle
    ? nodes.filter((node) => node.item.title.toLowerCase().includes(needle) || node.item.path.toLowerCase().includes(needle))
    : [];
  const matchPaths = new Set(matches.map((node) => node.item.path));

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

  if (nodes.length === 0) {
    return (
      <div className="graph-v2-view">
        <p className="empty-note">
          No linked pages in {project || "this project"} yet. Add a <code>[[wikilink]]</code> between two pages and it shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="graph-v2-view">
      <div className="graph-v2-controls">
        <div className="graph-v2-search">
          <Search size={15} />
          <input
            aria-label="Search graph"
            placeholder="Find a page…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches[0]) {
                event.preventDefault();
                setSelectedPath(matches[0].item.path);
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
        <section className="graph-v2-canvas-shell" aria-label="Page graph workspace">
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
            aria-label="In-project wikilink graph"
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={() => setDragStart(null)}
          >
            <defs>
              <radialGradient id="pageGraphNodeGlow">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.42" />
                <stop offset="70%" stopColor="currentColor" stopOpacity="0.12" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {kindEdges.map((edge) => {
                const from = nodeByPath.get(edge.from);
                const to = nodeByPath.get(edge.to);
                if (!from || !to) return null;
                const active = selectedEdges.includes(edge);
                const hovered = activeEdge === edge;
                return (
                  <g
                    className={`graph-v2-edge-group ${active ? "is-active" : "is-muted"} ${hovered ? "is-hovered" : ""}`}
                    key={`${edge.from}-${edge.to}`}
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
                    <path className="graph-v2-edge-hit" d={bezierEdgePath(from, to)} />
                    <path className="graph-v2-edge" d={bezierEdgePath(from, to)} />
                  </g>
                );
              })}

              {nodes.map((node) => {
                const path = node.item.path;
                const selected = path === selectedNode?.item.path;
                const related = neighborPaths.has(path);
                const isMatch = matchPaths.has(path);
                return (
                  <g
                    className={`graph-v2-node ${selected ? "is-selected" : ""} ${related ? "is-related" : "is-muted"} ${isMatch ? "is-search-match" : ""}`}
                    key={path}
                    role="button"
                    tabIndex={0}
                    transform={`translate(${node.x} ${node.y})`}
                    style={{ "--node-color": kindColor(node.item.kind) } as CSSProperties}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedPath(path);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelectedPath(path);
                    }}
                  >
                    <circle className="graph-v2-node-glow" r={node.radius + 22} />
                    <circle className="graph-v2-node-core" r={node.radius} />
                    <Network className="graph-v2-node-icon" x={-12} y={-42} size={24} />
                    <text className="graph-v2-node-title" textAnchor="middle" y="5">
                      {shortName(node.item.title)}
                    </text>
                    <text className="graph-v2-node-meta" textAnchor="middle" y="30">
                      {node.item.kind} / {node.degree}l
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </section>

        <aside className="graph-v2-inspector">
          <div className="graph-v2-inspector-head">
            <span className="section-kicker">{project} pages</span>
            <h2>{selectedNode?.item.title ?? "Page graph"}</h2>
            <p>{selectedNode ? `${selectedEdges.length} linked page${selectedEdges.length === 1 ? "" : "s"}` : `${edges.length} links`}</p>
            {selectedNode && (
              <button className="small-action" type="button" onClick={() => onOpenPage(project, selectedNode.item.path)}>
                <ExternalLink size={15} />
                Open page
              </button>
            )}
          </div>

          <div className="graph-v2-stats">
            <div>
              <strong>{nodes.length}</strong>
              <span>nodes</span>
            </div>
            <div>
              <strong>{kindEdges.length}</strong>
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
                  <strong>{nodeByPath.get(activeEdge.from)?.item.title ?? activeEdge.from}</strong> &gt; <strong>{nodeByPath.get(activeEdge.to)?.item.title ?? activeEdge.to}</strong>
                </p>
                <p className="graph-v2-edge-detail-label">
                  wikilink · {activeEdge.count} link{activeEdge.count === 1 ? "" : "s"}
                </p>
              </>
            ) : (
              <p className="empty-note">Hover or focus an edge to see which pages link each other.</p>
            )}
          </div>

          <div className="graph-v2-edge-list">
            {listEdges.map((edge) => (
              <button
                className={`graph-v2-edge-row ${activeEdge === edge ? "is-hovered" : ""}`}
                key={`${edge.from}-${edge.to}`}
                type="button"
                onMouseEnter={() => setActiveEdge(edge)}
                onFocus={() => setActiveEdge(edge)}
                onClick={() => setSelectedPath(edge.to === selectedPath ? edge.from : edge.to)}
              >
                <span>
                  <GitBranch size={15} />
                  <strong>wikilink</strong>
                  <code>{edge.count}</code>
                </span>
                <small>
                  {nodeByPath.get(edge.from)?.item.title ?? edge.from} &gt; {nodeByPath.get(edge.to)?.item.title ?? edge.to}
                </small>
              </button>
            ))}
          </div>

          <button className="graph-v2-reset" type="button" onClick={() => setSelectedPath(nodes[0]?.item.path ?? "")}>
            <RotateCcw size={15} />
            Reset focus
          </button>
        </aside>
      </div>
    </div>
  );
}

function layoutNodes(pages: PageSummary[], edges: PageGraphEdge[]): GraphNode[] {
  const connected = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const visible = pages.filter((page) => connected.has(page.path));
  const degreeByPath = new Map<string, number>();
  edges.forEach((edge) => {
    degreeByPath.set(edge.from, (degreeByPath.get(edge.from) ?? 0) + edge.count);
    degreeByPath.set(edge.to, (degreeByPath.get(edge.to) ?? 0) + edge.count);
  });

  return layoutCircular(
    visible,
    (page) => page.path,
    degreeByPath,
    (_page, degree) => 42 + Math.min(16, degree * 3),
  );
}

function kindColor(kind: PageKind) {
  if (kind === "decision") return "var(--amber)";
  if (kind === "fact") return "var(--green)";
  if (kind === "gotcha") return "var(--rose)";
  return "var(--cyan)";
}

function shortName(name: string) {
  if (name.length <= 18) return name;
  return `${name.slice(0, 15)}...`;
}
