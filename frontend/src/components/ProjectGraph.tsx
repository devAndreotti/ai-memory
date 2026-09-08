import {
  Camera,
  ExternalLink,
  Flame,
  GitBranch,
  GitFork,
  Globe,
  Layers,
  LocateFixed,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { PageKind, ProjectGraphEdge, ProjectSummary } from "../types";

interface NodeData {
  id: string;
  project: ProjectSummary;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pinned: boolean;
  dimmed: boolean;
  degree: number;
}

interface LinkData {
  source: NodeData;
  target: NodeData;
  edge: ProjectGraphEdge;
}

interface ProjectGraphProps {
  projects: ProjectSummary[];
  edges: ProjectGraphEdge[];
  onOpenProject: (project: string) => void;
}


export function getProjectCluster(name: string): { key: "infra" | "aiops" | "apps" | "lab"; label: string; offset: { x: number; y: number } } {
  const n = name.toLowerCase();
  if (["sapphire-fusion", "ostg01", "emerald-fusion", "kali-lab", "docker-image-doctor", "mikrotik"].some(k => n.includes(k))) {
    return { key: "infra", label: "Infra & Hosts", offset: { x: -280, y: -160 } };
  }
  if (["ai-plans", "hub-gestao", "ai-memory", "quality-gate", "curator"].some(k => n.includes(k))) {
    return { key: "aiops", label: "AI-Ops & Workflows", offset: { x: 280, y: -160 } };
  }
  if (["onemob", "tcc-free-plaud", "feed-dispatch", "antigravity-tracker", "black_hole", "orbitaly"].some(k => n.includes(k))) {
    return { key: "apps", label: "Apps & Systems", offset: { x: -280, y: 160 } };
  }
  return { key: "lab", label: "Labs & Personal", offset: { x: 280, y: 160 } };
}

const KIND_OPTIONS: PageKind[] = ["rule", "decision", "fact", "gotcha"];

const ACCENT_PALETTE: Record<string, { fill: string; stroke: string; glow: string; label: string }> = {
  infra: { fill: "#22c7c5", stroke: "#14b8a6", glow: "rgba(34, 199, 197, 0.38)", label: "Infra & Hosts" },
  aiops: { fill: "#e0aa3e", stroke: "#d97706", glow: "rgba(224, 170, 62, 0.38)", label: "AI-Ops & Workflows" },
  apps: { fill: "#78c66c", stroke: "#16a34a", glow: "rgba(120, 198, 108, 0.38)", label: "Apps & Systems" },
  lab: { fill: "#e06c64", stroke: "#e11d48", glow: "rgba(224, 108, 100, 0.38)", label: "Labs & Personal" },
  cyan: { fill: "#22c7c5", stroke: "#14b8a6", glow: "rgba(34, 199, 197, 0.38)", label: "Cyan" },
  amber: { fill: "#e0aa3e", stroke: "#d97706", glow: "rgba(224, 170, 62, 0.38)", label: "Amber" },
  green: { fill: "#78c66c", stroke: "#16a34a", glow: "rgba(120, 198, 108, 0.38)", label: "Green" },
  rose: { fill: "#e06c64", stroke: "#e11d48", glow: "rgba(224, 108, 100, 0.38)", label: "Rose" },
};

const ACTIVITY_RING: Record<string, { color: string; width: number; dash: number[]; pulse: boolean; glow?: boolean }> = {
  active: { color: "#22c7c5", width: 2.5, dash: [], pulse: true, glow: true },
  steady: { color: "#78c66c", width: 2.0, dash: [], pulse: false },
  quiet: { color: "#e0aa3e", width: 1.5, dash: [3, 3], pulse: false },
  empty: { color: "#6d7a71", width: 1.2, dash: [2, 4], pulse: false },
};

function computeConvexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (!points || points.length < 3) return points ? points.slice() : [];
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  function cross(o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  const lower: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) {
      lower.pop();
    }
    lower.push(pts[i]);
  }

  const upper: { x: number; y: number }[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) {
      upper.pop();
    }
    upper.push(pts[i]);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function ProjectGraph({ projects, edges, onOpenProject }: ProjectGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [selectedProject, setSelectedProject] = useState<string>(projects[0]?.project_name ?? "");
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);
  const [mode, setMode] = useState<"local" | "global">("global");
  const [kindFilter, setKindFilter] = useState<Set<PageKind>>(new Set());
  const [search, setSearch] = useState<string>("");
  const [activeEdge, setActiveEdge] = useState<ProjectGraphEdge | null>(null);

  const [layoutMode, setLayoutMode] = useState<"force" | "dag">("force");
  const [colorMode, setColorMode] = useState<"accent" | "activity">("accent");
  const [clustersEnabled, setClustersEnabled] = useState<boolean>(true);
  const [particlesEnabled, setParticlesEnabled] = useState<boolean>(true);
  const [criticalPathEnabled, setCriticalPathEnabled] = useState<boolean>(false);
  const [physicsRunning, setPhysicsRunning] = useState<boolean>(true);
  const [zoomPercent, setZoomPercent] = useState<number>(100);

  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    project: ProjectSummary;
    linksCount: number;
  } | null>(null);

  const nodesRef = useRef<NodeData[]>([]);
  const linksRef = useRef<LinkData[]>([]);
  const nodeMapRef = useRef<Map<string, NodeData>>(new Map());
  const adjMapRef = useRef<Map<string, Set<string>>>(new Map());
  const upstreamMapRef = useRef<Map<string, Set<string>>>(new Map());
  const downstreamMapRef = useRef<Map<string, Set<string>>>(new Map());
  const particlesRef = useRef<{ link: LinkData; t: number; speed: number }[]>([]);
  const dagCoordsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const criticalNodesRef = useRef<Set<string>>(new Set());
  const criticalLinksRef = useRef<Set<LinkData>>(new Set());
  const blastNodesRef = useRef<Set<string>>(new Set());
  const blastLinksRef = useRef<Set<LinkData>>(new Set());

  const cameraRef = useRef<{ x: number; y: number; scale: number }>({ x: 0, y: 0, scale: 1.0 });
  const alphaRef = useRef<number>(1.0);
  const isDraggingBgRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggedNodeRef = useRef<NodeData | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const passesKind = useCallback(
    (edge: ProjectGraphEdge) => kindFilter.size === 0 || edge.kinds.some((k) => kindFilter.has(k)),
    [kindFilter],
  );

  const reheat = useCallback(() => {
    alphaRef.current = Math.max(alphaRef.current, 0.45);
    setPhysicsRunning(true);
  }, []);

  const updateZoomDisplay = useCallback(() => {
    setZoomPercent(Math.round(cameraRef.current.scale * 100));
  }, []);

  const computeDAGLayout = useCallback(() => {
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const ranks = new Map<string, number>();

    nodes.forEach((n) => ranks.set(n.id, 0));

    let changed = true;
    let passes = 0;
    while (changed && passes < 25) {
      changed = false;
      passes++;
      for (const link of links) {
        const sRank = ranks.get(link.source.id) ?? 0;
        const tRank = ranks.get(link.target.id) ?? 0;
        if (tRank <= sRank) {
          ranks.set(link.target.id, sRank + 1);
          changed = true;
        }
      }
    }

    const layerBuckets = new Map<number, NodeData[]>();
    nodes.forEach((n) => {
      const r = ranks.get(n.id) ?? 0;
      if (!layerBuckets.has(r)) layerBuckets.set(r, []);
      layerBuckets.get(r)!.push(n);
    });

    const maxRank = Math.max(...Array.from(layerBuckets.keys()), 0);
    const dagCoords = new Map<string, { x: number; y: number }>();

    layerBuckets.forEach((layerNodes, r) => {
      const totalH = (layerNodes.length - 1) * 75;
      layerNodes.forEach((n, idx) => {
        dagCoords.set(n.id, {
          x: (r - maxRank / 2) * 230,
          y: idx * 75 - totalH / 2,
        });
      });
    });

    dagCoordsRef.current = dagCoords;
  }, []);

  const computeCriticalPath = useCallback(() => {
    criticalNodesRef.current.clear();
    criticalLinksRef.current.clear();

    const nodes = nodesRef.current;
    const links = linksRef.current;
    if (nodes.length === 0 || links.length === 0) return;

    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();

    nodes.forEach((n) => {
      dist.set(n.id, 1);
      prev.set(n.id, null);
    });

    for (let pass = 0; pass < nodes.length; pass++) {
      for (const l of links) {
        const u = l.source.id;
        const v = l.target.id;
        const du = dist.get(u);
        const dv = dist.get(v);
        if (du !== undefined && dv !== undefined && du + 1 > dv) {
          dist.set(v, du + 1);
          prev.set(v, u);
        }
      }
    }

    let bestEnd: string | null = null;
    let maxD = 0;
    dist.forEach((d, k) => {
      if (d > maxD) {
        maxD = d;
        bestEnd = k;
      }
    });

    if (bestEnd && maxD >= 2) {
      let curr: string | null = bestEnd;
      while (curr) {
        criticalNodesRef.current.add(curr);
        const p = prev.get(curr);
        if (p) {
          for (const l of links) {
            if (l.source.id === p && l.target.id === curr) {
              criticalLinksRef.current.add(l);
            }
          } 
        }
        curr = p ?? null;
      }
    }
  }, []);

  const computeBlastRadius = useCallback((startNodeId: string | null) => {
    blastNodesRef.current.clear();
    blastLinksRef.current.clear();
    if (!startNodeId) return;

    const queue = [startNodeId];
    const visited = new Set<string>([startNodeId]);

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const downstream = downstreamMapRef.current.get(currId);
      if (!downstream) continue;

      downstream.forEach((childId) => {
        blastNodesRef.current.add(childId);
        if (!visited.has(childId)) {
          visited.add(childId);
          queue.push(childId);
        }
      });
    }

    for (const l of linksRef.current) {
      if (visited.has(l.source.id) && visited.has(l.target.id)) {
        blastLinksRef.current.add(l);
      }
    }
  }, []);

  useEffect(() => {
    const connected = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    const visibleProjects = projects;

    const degreeByProject = new Map<string, number>();
    edges.forEach((edge) => {
      degreeByProject.set(edge.from, (degreeByProject.get(edge.from) ?? 0) + edge.count);
      degreeByProject.set(edge.to, (degreeByProject.get(edge.to) ?? 0) + edge.count);
    });

    const clusterOffsets: Record<string, { x: number; y: number }> = {
      cyan: { x: -240, y: -150 },
      amber: { x: 240, y: -150 },
      green: { x: -240, y: 150 },
      rose: { x: 240, y: 150 },
    };

    const nodeMap = new Map<string, NodeData>();
    const adjMap = new Map<string, Set<string>>();
    const upstreamMap = new Map<string, Set<string>>();
    const downstreamMap = new Map<string, Set<string>>();

    const existingMap = nodeMapRef.current;

    const nodes: NodeData[] = visibleProjects.map((p, index) => {
      const degree = degreeByProject.get(p.project_name) ?? 0;
      const cluster = getProjectCluster(p.project_name); const base = cluster.offset;
      const angle = (index / Math.max(1, visibleProjects.length)) * Math.PI * 2;
      const dist = 40 + Math.random() * 80;

      const existing = existingMap.get(p.project_name);
      const node: NodeData = {
        id: p.project_name,
        project: p,
        x: existing ? existing.x : base.x + Math.cos(angle) * dist,
        y: existing ? existing.y : base.y + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: Math.max(14, Math.min(26, 12 + Math.sqrt(p.page_count || 1) * 2.2 + degree * 1.8)),
        pinned: existing ? existing.pinned : false,
        dimmed: false,
        degree,
      };

      nodeMap.set(node.id, node);
      adjMap.set(node.id, new Set());
      upstreamMap.set(node.id, new Set());
      downstreamMap.set(node.id, new Set());
      return node;
    });

    const links: LinkData[] = [];
    edges.filter(passesKind).forEach((edge) => {
      const s = nodeMap.get(edge.from);
      const t = nodeMap.get(edge.to);
      if (s && t) {
        const link: LinkData = { source: s, target: t, edge };
        links.push(link);
        adjMap.get(s.id)?.add(t.id);
        adjMap.get(t.id)?.add(s.id);
        upstreamMap.get(t.id)?.add(s.id);
        downstreamMap.get(s.id)?.add(t.id);
      } 
    });

    const particles: { link: LinkData; t: number; speed: number }[] = [];
    links.forEach((link) => {
      particles.push({
        link,
        t: Math.random(),
        speed: 0.005 + Math.random() * 0.005,
      });
    });

    nodesRef.current = nodes;
    linksRef.current = links;
    nodeMapRef.current = nodeMap;
    adjMapRef.current = adjMap;
    upstreamMapRef.current = upstreamMap;
    downstreamMapRef.current = downstreamMap;
    particlesRef.current = particles;

    computeDAGLayout();
    computeCriticalPath();
    reheat();
  }, [projects, edges, passesKind, computeDAGLayout, computeCriticalPath, reheat]);

  useEffect(() => {
    const needle = search.trim().toLowerCase();
    const activeTarget = hoveredProject || selectedProject;
    const selectedEdges = edges.filter(passesKind).filter((e) => e.from === activeTarget || e.to === activeTarget);
    const localNeighbors = new Set(selectedEdges.flatMap((e) => [e.from, e.to]));
    if (activeTarget) localNeighbors.add(activeTarget);

    nodesRef.current.forEach((node) => {
      let visible = true;
      if (mode === "local" && !localNeighbors.has(node.id)) {
        visible = false;
      }
      if (needle && !node.id.toLowerCase().includes(needle) && !node.project.workspace_name.toLowerCase().includes(needle)) {
        visible = false;
      }
      node.dimmed = !visible;
    });
  }, [search, mode, hoveredProject, selectedProject, edges, passesKind]);

  const autoFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const visibleNodes = nodesRef.current.filter((n) => !n.dimmed);
    if (visibleNodes.length === 0) {
      cameraRef.current = { x: canvas.width / 2, y: canvas.height / 2, scale: 1.0 };
      updateZoomDisplay();
      reheat();
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const n of visibleNodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    const pad = 100;
    const bboxW = Math.max(maxX - minX + pad * 2, 220);
    const bboxH = Math.max(maxY - minY + pad * 2, 220);

    const scaleX = canvas.width / bboxW;
    const scaleY = canvas.height / bboxH;
    const newScale = Math.max(0.35, Math.min(1.8, Math.min(scaleX, scaleY) * 0.92));

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    cameraRef.current = {
      scale: newScale,
      x: canvas.width / 2 - midX * newScale,
      y: canvas.height / 2 - midY * newScale,
    };

    updateZoomDisplay();
    reheat();
  }, [updateZoomDisplay, reheat]);

  const resetCamera = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    cameraRef.current = { x: canvas.width / 2, y: canvas.height / 2, scale: 1.0 };
    updateZoomDisplay();
    reheat();
  }, [updateZoomDisplay, reheat]);

  const zoomByStep = useCallback(
    (delta: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const oldScale = cameraRef.current.scale;
      const newScale = Math.min(2.5, Math.max(0.3, oldScale + delta));
      const centerScreenX = canvas.width / 2;
      const centerScreenY = canvas.height / 2;
      const worldX = (centerScreenX - cameraRef.current.x) / oldScale;
      const worldY = (centerScreenY - cameraRef.current.y) / oldScale;

      cameraRef.current.scale = newScale;
      cameraRef.current.x = centerScreenX - worldX * newScale;
      cameraRef.current.y = centerScreenY - worldY * newScale;

      updateZoomDisplay();
      reheat();
    },
    [updateZoomDisplay, reheat],
  );

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 900;
    const h = rect.height || 600;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
    reheat();
  }, [reheat]);

  useEffect(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  const exportSnapshotPNG = useCallback(() => {
    const offCanvas = document.createElement("canvas");
    const w = 1920;
    const h = 1080;
    offCanvas.width = w;
    offCanvas.height = h;
    const oCtx = offCanvas.getContext("2d");
    if (!oCtx) return;

    oCtx.fillStyle = "#0d0f0e";
    oCtx.fillRect(0, 0, w, h);

    oCtx.fillStyle = "rgba(255, 255, 255, 0.04)";
    for (let gx = 0; gx < w; gx += 40) {
      for (let gy = 0; gy < h; gy += 40) {
        oCtx.fillRect(gx, gy, 1.5, 1.5);
      }
    }

    const visibleNodes = nodesRef.current.filter((n) => !n.dimmed);
    if (visibleNodes.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    visibleNodes.forEach((n) => {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });

    const pad = 120;
    const bboxW = Math.max(maxX - minX + pad * 2, 300);
    const bboxH = Math.max(maxY - minY + pad * 2, 300);
    const fitScale = Math.min(w / bboxW, h / bboxH) * 0.9;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    oCtx.save();
    oCtx.translate(w / 2, h / 2);
    oCtx.scale(fitScale, fitScale);
    oCtx.translate(-midX, -midY);

    linksRef.current.forEach((l) => {
      const s = l.source;
      const t = l.target;
      oCtx.beginPath();
      oCtx.moveTo(s.x, s.y);
      oCtx.lineTo(t.x, t.y);
      oCtx.strokeStyle = "rgba(155, 169, 159, 0.35)";
      oCtx.lineWidth = 2;
      oCtx.stroke();
    });

    visibleNodes.forEach((n) => {
      const style = ACCENT_PALETTE[n.project.accent] || ACCENT_PALETTE.cyan;
      oCtx.beginPath();
      oCtx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      oCtx.fillStyle = style.fill;
      oCtx.fill();
      oCtx.strokeStyle = style.stroke;
      oCtx.lineWidth = 2;
      oCtx.stroke();

      oCtx.fillStyle = "#ffffff";
      oCtx.font = "bold 13px system-ui, sans-serif";
      oCtx.textAlign = "center";
      oCtx.textBaseline = "middle";
      oCtx.fillText(n.id, n.x, n.y);
    });

    oCtx.restore();

    oCtx.fillStyle = "#9ba99f";
    oCtx.font = "600 13px system-ui, sans-serif";
    oCtx.fillText(`ai-memory • Project Graph Topology • ${new Date().toISOString().split("T")[0]}`, 32, h - 28);

    const dataUrl = offCanvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `ai-memory-topology-graph-${Date.now()}.png`;
    a.click();
  }, []);

  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) {
        animId = requestAnimationFrame(render);
        return;
      }

      const rect = wrap.getBoundingClientRect();
      const width = rect.width || 900;
      const height = rect.height || 600;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      if (physicsRunning && alphaRef.current > 0.0015) {
        const nodes = nodesRef.current;
        const links = linksRef.current;
        const N = nodes.length;

        if (layoutMode === "dag") {
          const kDAG = 0.08;
          const dagCoords = dagCoordsRef.current;
          for (let i = 0; i < N; i++) {
            const n = nodes[i];
            const target = dagCoords.get(n.id);
            if (target && !n.pinned && n !== draggedNodeRef.current) {
              n.vx += (target.x - n.x) * kDAG;
              n.vy += (target.y - n.y) * kDAG;
              n.vx *= 0.82;
              n.vy *= 0.82;
              n.x += n.vx * alphaRef.current;
              n.y += n.vy * alphaRef.current;
            }
          }
          alphaRef.current *= 0.985;
        } else {
          const kRep = 3400;
          const kSpring = 0.046;
          const l0 = 88;
          const kCenter = 0.0022;
          const kCluster = 0.016;

          const clusterOffsets: Record<string, { x: number; y: number }> = {
            cyan: { x: -240, y: -150 },
            amber: { x: 240, y: -150 },
            green: { x: -240, y: 150 },
            rose: { x: 240, y: 150 },
          };

          for (let i = 0; i < N; i++) {
            const n1 = nodes[i];
            for (let j = i + 1; j < N; j++) {
              const n2 = nodes[j];
              const dx = n2.x - n1.x;
              const dy = n2.y - n1.y;
              let distSq = dx * dx + dy * dy;
              if (distSq < 1) distSq = 1;
              const dist = Math.sqrt(distSq);
              const force = kRep / (distSq + 32);
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              n1.vx -= fx;
              n1.vy -= fy;
              n2.vx += fx;
              n2.vy += fy;
            }
          }

          for (let k = 0; k < links.length; k++) {
            const l = links[k];
            const s = l.source;
            const t = l.target;
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const delta = dist - l0;
            const force = delta * kSpring;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            s.vx += fx;
            s.vy += fy;
            t.vx -= fx;
            t.vy -= fy;
          }

          for (let i = 0; i < N; i++) {
            const n = nodes[i];
            const c = getProjectCluster(n.id).offset;
            n.vx += (c.x - n.x) * kCluster;
            n.vy += (c.y - n.y) * kCluster;

            n.vx -= n.x * kCenter;
            n.vy -= n.y * kCenter;

            if (!n.pinned && n !== draggedNodeRef.current) {
              n.vx *= 0.88;
              n.vy *= 0.88;
              n.x += n.vx * alphaRef.current;
              n.y += n.vy * alphaRef.current;
            }
          }

          alphaRef.current *= 0.993;
        }
      }

      if (particlesEnabled) {
        for (const p of particlesRef.current) {
          p.t += p.speed;
          if (p.t > 1) p.t = 0;
        }
      }

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      ctx.translate(cameraRef.current.x, cameraRef.current.y);
      ctx.scale(cameraRef.current.scale, cameraRef.current.scale);

      ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
      const step = 40;
      const bound = 1500;
      for (let gx = -bound; gx <= bound; gx += step) {
        for (let gy = -bound; gy <= bound; gy += step) {
          ctx.fillRect(gx, gy, 1.5, 1.5);
        }
      }

      if (clustersEnabled) {
        const clusters: Record<string, NodeData[]> = {};
        for (const n of nodesRef.current) {
          if (n.dimmed) continue;
          const key = getProjectCluster(n.id).key;
          if (!clusters[key]) clusters[key] = [];
          clusters[key].push(n);
        }

        Object.keys(clusters).forEach((key) => {
          const cNodes = clusters[key];
          if (!cNodes || cNodes.length === 0) return;
          const style = ACCENT_PALETTE[key] || ACCENT_PALETTE.cyan;
          const pad = 38;

          if (cNodes.length === 1) {
            const n = cNodes[0];
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius + pad, 0, Math.PI * 2);
            ctx.fillStyle = style.fill + "12";
            ctx.fill();
            ctx.strokeStyle = style.fill + "38";
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            return;
          }

          if (cNodes.length === 2) {
            const [n1, n2] = cNodes;
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = (-dy / dist) * (pad + 10);
            const ny = (dx / dist) * (pad + 10);

            ctx.beginPath();
            ctx.moveTo(n1.x + nx, n1.y + ny);
            ctx.lineTo(n2.x + nx, n2.y + ny);
            ctx.arc(n2.x, n2.y, pad + 10, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
            ctx.lineTo(n1.x - nx, n1.y - ny);
            ctx.arc(n1.x, n1.y, pad + 10, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
            ctx.closePath();
            ctx.fillStyle = style.fill + "12";
            ctx.fill();
            ctx.strokeStyle = style.fill + "38";
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            return;
          }

          const hull = computeConvexHull(cNodes);
          if (hull.length >= 3) {
            let cx = 0;
            let cy = 0;
            hull.forEach((pt) => {
              cx += pt.x;
              cy += pt.y;
            });
            cx /= hull.length;
            cy /= hull.length;

            const expanded = hull.map((pt) => {
              const vx = pt.x - cx;
              const vy = pt.y - cy;
              const len = Math.sqrt(vx * vx + vy * vy) || 1;
              return {
                x: pt.x + (vx / len) * pad,
                y: pt.y + (vy / len) * pad,
              };
            });

            ctx.beginPath();
            const p0 = expanded[0];
            const pLast = expanded[expanded.length - 1];
            const midX = (p0.x + pLast.x) / 2;
            const midY = (p0.y + pLast.y) / 2;
            ctx.moveTo(midX, midY);

            for (let hi = 0; hi < expanded.length; hi++) {
              const curr = expanded[hi];
              const next = expanded[(hi + 1) % expanded.length];
              const nextMidX = (curr.x + next.x) / 2;
              const nextMidY = (curr.y + next.y) / 2;
              ctx.quadraticCurveTo(curr.x, curr.y, nextMidX, nextMidY);
            }
            ctx.closePath();

            ctx.fillStyle = style.fill + "12";
            ctx.fill();
            ctx.strokeStyle = style.fill + "38";
            ctx.lineWidth = 1.2;
            ctx.setLineDash([5, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            const topPt = expanded.reduce((min, pt) => (pt.y < min.y ? pt : min), expanded[0]);
            ctx.font = "600 11px system-ui, sans-serif";
            ctx.fillStyle = style.fill;
            ctx.textAlign = "center";
            ctx.fillText(style.label.toUpperCase() + " (" + cNodes.length + ")", topPt.x, topPt.y - 10);
          }
        });
      }

      const hoveredNodeId = hoveredProject || null;
      const selectedNodeId = selectedProject || null;
      const hasFocus = Boolean(hoveredNodeId || selectedNodeId);
      const focusTarget = hoveredNodeId || selectedNodeId;

      const links = linksRef.current;
      for (let i = 0; i < links.length; i++) {
        const l = links[i];
        const s = l.source;
        const t = l.target;

        const isBlastLink = Boolean(focusTarget && blastLinksRef.current.has(l));
        const isCriticalLink = criticalPathEnabled && criticalLinksRef.current.has(l);
        const isConnected = focusTarget && (s.id === focusTarget || t.id === focusTarget);

        const alpha = hasFocus ? (isConnected || isBlastLink ? 0.95 : 0.08) : s.dimmed || t.dimmed ? 0.12 : 0.45;
        const linkColor =
          isBlastLink || (isConnected && s.id === focusTarget)
            ? "#e06c64"
            : isConnected && t.id === focusTarget
              ? "#22c7c5"
              : isCriticalLink
                ? "#e0aa3e"
                : "rgba(155, 169, 159, " + alpha + ")";

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = linkColor;
        ctx.lineWidth = isBlastLink || isCriticalLink || isConnected ? 2.6 : 1.4;
        ctx.stroke();

        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const arrowDist = t.radius + 6;
        const ax = t.x - (dx / dist) * arrowDist;
        const ay = t.y - (dy / dist) * arrowDist;
        const angle = Math.atan2(dy, dx);
        const arrowSize = isConnected || isBlastLink || isCriticalLink ? 7 : 5;

        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - arrowSize * Math.cos(angle - Math.PI / 6), ay - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ax - arrowSize * Math.cos(angle + Math.PI / 6), ay - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = linkColor;
        ctx.fill();
      }

      if (particlesEnabled && (!hasFocus || selectedNodeId)) {
        ctx.fillStyle = "#22c7c5";
        for (const p of particlesRef.current) {
          const s = p.link.source;
          const t = p.link.target;
          if (hasFocus && s.id !== focusTarget && t.id !== focusTarget) continue;
          const px = s.x + (t.x - s.x) * p.t;
          const py = s.y + (t.y - s.y) * p.t;
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const time = Date.now() * 0.003;
      const nodes = nodesRef.current;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const isTarget = n.id === focusTarget;
        const isBlastNode = hasFocus && blastNodesRef.current.has(n.id);
        const isCriticalNode = criticalPathEnabled && criticalNodesRef.current.has(n.id);
        const isDownstream = hasFocus && focusTarget && downstreamMapRef.current.get(focusTarget)?.has(n.id);
        const isUpstream = hasFocus && focusTarget && upstreamMapRef.current.get(focusTarget)?.has(n.id);
        const isRelated = isTarget || isDownstream || isUpstream || isBlastNode;

        const isDimmedBySearch = n.dimmed;
        const nodeAlpha = isDimmedBySearch ? 0.12 : hasFocus ? (isRelated || isCriticalNode ? 1.0 : 0.18) : 1.0;
        ctx.globalAlpha = nodeAlpha;

        const clusterInfo = getProjectCluster(n.id); const accentStyle = ACCENT_PALETTE[clusterInfo.key] || ACCENT_PALETTE.cyan;
        const activityStyle = ACTIVITY_RING[n.project.activity] || ACTIVITY_RING.steady;
        const nodeFill = colorMode === "activity" ? activityStyle.color : accentStyle.fill;

        if (isTarget || isBlastNode || isUpstream || (activityStyle.glow && !hasFocus)) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 9, 0, Math.PI * 2);
          ctx.fillStyle = isBlastNode
            ? "rgba(224, 108, 100, 0.38)"
            : isUpstream
              ? "rgba(34, 199, 197, 0.38)"
              : isTarget
                ? "rgba(34, 199, 197, 0.35)"
                : "rgba(120, 198, 108, 0.22)";
          ctx.fill();
        } else if (isCriticalNode) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 8, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(224, 170, 62, 0.35)";
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = nodeFill;
        ctx.fill();

        ctx.beginPath();
        let ringRadius = n.radius + 3.5;
        if (activityStyle.pulse) {
          ringRadius += Math.sin(time) * 1.8;
        }
        ctx.arc(n.x, n.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = isBlastNode ? "#e06c64" : isCriticalNode ? "#e0aa3e" : activityStyle.color;
        ctx.lineWidth = isBlastNode || isCriticalNode || isTarget ? 2.6 : activityStyle.width;
        if (ctx.setLineDash) {
          ctx.setLineDash(activityStyle.dash);
        }
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);

        if (n.pinned) {
          ctx.fillStyle = "#e0aa3e";
          ctx.beginPath();
          ctx.arc(n.x + n.radius - 2, n.y - n.radius + 2, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = isRelated || isCriticalNode ? "#ffffff" : "#f3efe5";
        ctx.font = "600 " + (n.radius >= 26 ? "12px" : "11px") + " system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(n.id, n.x, n.y);

        if (cameraRef.current.scale >= 0.95 || isTarget || isCriticalNode) {
          ctx.font = "500 10px system-ui, -apple-system, sans-serif";
          ctx.fillStyle = "#9ba99f";
          ctx.fillText(n.project.page_count + " pages", n.x, n.y + n.radius + 12);
        }

        ctx.globalAlpha = 1.0;
      }

      ctx.restore();

      const mCanvas = minimapCanvasRef.current;
      if (mCanvas) {
        const mCtx = mCanvas.getContext("2d");
        if (mCtx) {
          const mw = mCanvas.width;
          const mh = mCanvas.height;
          mCtx.clearRect(0, 0, mw, mh);
          mCtx.fillStyle = "#121513";
          mCtx.fillRect(0, 0, mw, mh);

          const bound = 650;
          const mScaleX = mw / (bound * 2);
          const mScaleY = mh / (bound * 2);

          for (const n of nodesRef.current) {
            if (n.dimmed) continue;
            const mx = (n.x + bound) * mScaleX;
            const my = (n.y + bound) * mScaleY;
            if (mx >= 0 && mx <= mw && my >= 0 && my <= mh) {
              const style = ACCENT_PALETTE[n.project.accent] || ACCENT_PALETTE.cyan;
              mCtx.fillStyle = style.fill;
              mCtx.beginPath();
              mCtx.arc(mx, my, 2.5, 0, Math.PI * 2);
              mCtx.fill();
            }
          }

          const vpWorldLeft = -cameraRef.current.x / cameraRef.current.scale;
          const vpWorldTop = -cameraRef.current.y / cameraRef.current.scale;
          const vpWorldW = width / cameraRef.current.scale;
          const vpWorldH = height / cameraRef.current.scale;

          const rx = (vpWorldLeft + bound) * mScaleX;
          const ry = (vpWorldTop + bound) * mScaleY;
          const rw = vpWorldW * mScaleX;
          const rh = vpWorldH * mScaleY;

          mCtx.strokeStyle = "#22c7c5";
          mCtx.lineWidth = 1.4;
          mCtx.fillStyle = "rgba(34, 199, 197, 0.12)";
          mCtx.fillRect(rx, ry, rw, rh);
          mCtx.strokeRect(rx, ry, rw, rh);
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    animFrameIdRef.current = animId;

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [
    physicsRunning,
    layoutMode,
    clustersEnabled,
    particlesEnabled,
    criticalPathEnabled,
    colorMode,
    hoveredProject,
    selectedProject,
  ]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const worldX = (clientX - cameraRef.current.x) / cameraRef.current.scale;
    const worldY = (clientY - cameraRef.current.y) / cameraRef.current.scale;

    let clickedNode: NodeData | null = null;
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      if (n.dimmed) continue;
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 5) {
        clickedNode = n;
        break;
      }
    }

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      setSelectedProject(clickedNode.id);
      computeBlastRadius(clickedNode.id);
      reheat();
    } else {
      isDraggingBgRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    if (draggedNodeRef.current) {
      const worldX = (clientX - cameraRef.current.x) / cameraRef.current.scale;
      const worldY = (clientY - cameraRef.current.y) / cameraRef.current.scale;
      draggedNodeRef.current.x = worldX;
      draggedNodeRef.current.y = worldY;
      draggedNodeRef.current.vx = 0;
      draggedNodeRef.current.vy = 0;
      reheat();
      return;
    }

    if (isDraggingBgRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      cameraRef.current.x += dx;
      cameraRef.current.y += dy;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const worldX = (clientX - cameraRef.current.x) / cameraRef.current.scale;
    const worldY = (clientY - cameraRef.current.y) / cameraRef.current.scale;

    let foundNode: NodeData | null = null;
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      if (n.dimmed) continue;
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 5) {
        foundNode = n;
        break;
      }
    }

    if (foundNode) {
      setHoveredProject(foundNode.id);
      computeBlastRadius(foundNode.id);
      const linksCount = (adjMapRef.current.get(foundNode.id) || new Set()).size;
      setTooltip({
        x: clientX,
        y: clientY,
        project: foundNode.project,
        linksCount,
      });
    } else {
      setHoveredProject(null);
      computeBlastRadius(selectedProject || null);
      setTooltip(null);
    }
  };

  const handlePointerUp = () => {
    draggedNodeRef.current = null;
    isDraggingBgRef.current = false;
  };

  const handleDoubleClick = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const worldX = (clientX - cameraRef.current.x) / cameraRef.current.scale;
    const worldY = (clientY - cameraRef.current.y) / cameraRef.current.scale;

    for (const n of nodesRef.current) {
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 5) {
        n.pinned = !n.pinned;
        reheat();
        break;
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const oldScale = cameraRef.current.scale;
    const newScale = Math.min(2.5, Math.max(0.3, oldScale * zoomFactor));

    const worldX = (mouseX - cameraRef.current.x) / oldScale;
    const worldY = (mouseY - cameraRef.current.y) / oldScale;

    cameraRef.current.scale = newScale;
    cameraRef.current.x = mouseX - worldX * newScale;
    cameraRef.current.y = mouseY - worldY * newScale;

    updateZoomDisplay();
    reheat();
  };

  const handleMinimapInteraction = (e: ReactPointerEvent<HTMLDivElement>) => {
    const mCanvas = minimapCanvasRef.current;
    const canvas = canvasRef.current;
    if (!mCanvas || !canvas) return;

    const rect = mCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const bound = 650;
    const worldX = (mx / mCanvas.width) * (bound * 2) - bound;
    const worldY = (my / mCanvas.height) * (bound * 2) - bound;

    cameraRef.current.x = canvas.width / 2 - worldX * cameraRef.current.scale;
    cameraRef.current.y = canvas.height / 2 - worldY * cameraRef.current.scale;

    reheat();
  };

  const selectedNode = nodeMapRef.current.get(selectedProject) || nodesRef.current[0];
  const kindEdges = edges.filter(passesKind);
  const selectedEdges = kindEdges.filter(
    (edge) => edge.from === selectedNode?.id || edge.to === selectedNode?.id,
  );
  const listEdges = selectedEdges.length ? selectedEdges : kindEdges;

  const toggleKind = (kind: PageKind) =>
    setKindFilter((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <div className="graph-v2-view graph-card">
      <div className="graph-v2-controls graph-toolbar">
        <div className="graph-toolbar-left">
          <div className="graph-v2-mode graph-toolbar-group" role="group" aria-label="Graph scope">
            <button
              type="button"
              className={mode === "local" ? "is-active graph-tool-btn active" : "graph-tool-btn"}
              aria-pressed={mode === "local"}
              onClick={() => setMode("local")}
              title="Escopo Local (Nós conectados)"
            >
              <LocateFixed size={14} />
              Local
            </button>
            <button
              type="button"
              className={mode === "global" ? "is-active graph-tool-btn active" : "graph-tool-btn"}
              aria-pressed={mode === "global"}
              onClick={() => setMode("global")}
              title="Escopo Global (Todos os projetos)"
            >
              <Globe size={14} />
              Global
            </button>
          </div>

          <div className="graph-v2-search">
            <Search size={14} />
            <input
              aria-label="Search graph"
              className="graph-search-input"
              placeholder="Find a project…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const match = nodesRef.current.find(
                    (n) => n.id.toLowerCase().includes(search.toLowerCase()) && !n.dimmed,
                  );
                  if (match) {
                    setSelectedProject(match.id);
                    computeBlastRadius(match.id);
                    reheat();
                  }
                }
              }}
            />
          </div>

          <div className="graph-v2-kinds" role="group" aria-label="Filter links by kind">
            {KIND_OPTIONS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={kindFilter.has(kind) ? "is-active" : ""}
                aria-pressed={kindFilter.has(kind)}
                onClick={() => toggleKind(kind)}
              >
                {kind}
              </button>
            ))}
          </div>
        </div>

        <div className="graph-toolbar-right">
          <div className="graph-toolbar-group">
            <button
              type="button"
              className={`graph-tool-btn ${layoutMode === "force" ? "active" : ""}`}
              onClick={() => {
                setLayoutMode("force");
                reheat();
              }}
              title="Layout: Grafo Orgânico Estilo Obsidian"
            >
              <Workflow size={14} />
              Força
            </button>
            <button
              type="button"
              className={`graph-tool-btn ${layoutMode === "dag" ? "active" : ""}`}
              onClick={() => {
                setLayoutMode("dag");
                computeDAGLayout();
                reheat();
              }}
              title="Layout: Pipeline Hierárquico (DAG)"
            >
              <GitFork size={14} />
              Pipeline
            </button>
          </div>

          <div className="graph-toolbar-group">
            <button
              type="button"
              className={`graph-tool-btn ${criticalPathEnabled ? "active" : ""}`}
              onClick={() => {
                setCriticalPathEnabled(!criticalPathEnabled);
                reheat();
              }}
              title="Destacar Rota Crítica e Gargalos"
            >
              <Zap size={14} />
              Rota Crítica
            </button>
            <button
              type="button"
              className={`graph-tool-btn ${clustersEnabled ? "active" : ""}`}
              onClick={() => setClustersEnabled(!clustersEnabled)}
              title="Agrupamento por Ambiente (Convex Hulls)"
            >
              <Layers size={14} />
              Clusters
            </button>
            <button
              type="button"
              className={`graph-tool-btn ${particlesEnabled ? "active" : ""}`}
              onClick={() => setParticlesEnabled(!particlesEnabled)}
              title="Ligar / Desligar fluxo de partículas"
            >
              <Sparkles size={14} />
              Fluxo
            </button>
          </div>
        </div>
      </div>

      <div className="graph-v2-body">
        <div className="graph-v2-canvas-shell graph-canvas-wrap" id="graphCanvasWrap" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="graph-v2-canvas graph-canvas"
            tabIndex={0}
            aria-label="Visualizador de Grafo Físico estilo Obsidian"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
          />

          {tooltip && (
            <div
              className="graph-node-tooltip"
              style={{
                left: `${tooltip.x + 15}px`,
                top: `${tooltip.y + 15}px`,
              }}
            >
              <div className="gtt-id">{tooltip.project.project_name}</div>
              <div className="gtt-title">{tooltip.project.workspace_name}</div>
              <div className="gtt-meta">
                <span className="project-pill" data-accent={tooltip.project.accent}>
                  {tooltip.project.accent}
                </span>
                <span className="project-pill" data-accent="cyan">
                  {tooltip.project.page_count} pages
                </span>
                <span className="project-pill" data-accent="green">
                  {tooltip.linksCount} links
                </span>
              </div>
            </div>
          )}

          <div className="graph-floating-dock">
            <div className="graph-dock-zoom">
              <button
                type="button"
                className="graph-dock-btn"
                onClick={() => zoomByStep(-0.15)}
                title="Reduzir zoom"
              >
                <Minus size={13} />
              </button>
              <span className="graph-zoom-label" data-graph-zoom-val>
                {zoomPercent}%
              </span>
              <button
                type="button"
                className="graph-dock-btn"
                onClick={() => zoomByStep(0.15)}
                title="Aumentar zoom"
              >
                <Plus size={13} />
              </button>
            </div>

            <div className="graph-dock-divider" />

            <div className="graph-dock-actions">
              <button
                type="button"
                className="graph-dock-btn"
                onClick={autoFit}
                title="Auto-Fit: Enquadrar todos os nós no viewport"
              >
                <Maximize2 size={13} />
                Fit
              </button>
              <button
                type="button"
                className="graph-dock-btn"
                onClick={resetCamera}
                title="Resetar câmera para 100%"
              >
                <RotateCcw size={13} />
                100%
              </button>
              <button
                type="button"
                className="graph-dock-btn"
                onClick={reheat}
                title="Re-aquecer simulação física"
              >
                <Flame size={13} />
                Soltar
              </button>
              <button
                type="button"
                className="graph-dock-btn"
                onClick={() => setPhysicsRunning(!physicsRunning)}
                title="Pausar / Continuar simulação física"
              >
                {physicsRunning ? <Pause size={13} /> : <Play size={13} />}
                {physicsRunning ? "Pausa" : "Play"}
              </button>
              <button
                type="button"
                className="graph-dock-btn"
                onClick={exportSnapshotPNG}
                title="Exportar imagem do grafo em alta resolução (PNG 2x)"
              >
                <Camera size={13} />
                PNG
              </button>
            </div>
          </div>

          <div
            className="graph-minimap"
            id="graphMinimap"
            title="Clique ou arraste para navegar no mapa"
            onPointerDown={handleMinimapInteraction}
            onPointerMove={(e) => {
              if (e.buttons === 1) handleMinimapInteraction(e);
            }}
          >
            <span className="graph-minimap-label">Mini-mapa</span>
            <canvas
              ref={minimapCanvasRef}
              className="graph-minimap-canvas"
              width={148}
              height={98}
            />
          </div>
        </div>

        <aside className="graph-v2-inspector" aria-label="Graph inspector">
          <div className="graph-v2-inspector-head">
            <span className="project-pill" data-accent={selectedNode?.project?.accent ?? "cyan"}>
              {selectedNode?.project?.accent ?? "cyan"}
            </span>
            <h2>{selectedNode?.project?.project_name ?? "No project selected"}</h2>
            <p>
              {selectedNode?.project?.page_count ?? 0} pages ·{" "}
              {selectedEdges.length
                ? `${selectedEdges.length} cross-project links`
                : `${edges.length} links`}
            </p>
            {selectedNode && (
              <button
                className="small-action"
                type="button"
                onClick={() => onOpenProject(selectedNode.project.project_name)}
              >
                <ExternalLink size={15} />
                Open project
              </button>
            )}
          </div>

          <div className="graph-v2-stats">
            <div>
              <strong>{nodesRef.current.filter((n) => !n.dimmed).length}</strong>
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
                  <strong>{activeEdge.from}</strong> &gt; <strong>{activeEdge.to}</strong>
                </p>
                <p className="graph-v2-edge-detail-label">
                  {activeEdge.label} · {activeEdge.count} link
                  {activeEdge.count === 1 ? "" : "s"} · {activeEdge.kinds.join(", ")}
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
                className={`graph-v2-edge-row ${activeEdge === edge || hoveredProject === edge.from ? "is-hovered" : ""}`}
                key={`${edge.from}-${edge.to}-${edge.label}`}
                type="button"
                onMouseEnter={() => {
                  setActiveEdge(edge);
                  setHoveredProject(edge.from);
                }}
                onMouseLeave={() => {
                  setHoveredProject(null);
                }}
                onFocus={() => {
                  setActiveEdge(edge);
                  setHoveredProject(edge.from);
                }}
                onClick={() => {
                  const target = edge.to === selectedProject ? edge.from : edge.to;
                  setSelectedProject(target);
                  computeBlastRadius(target);
                  reheat();
                }}
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

          <button
            className="graph-v2-reset"
            type="button"
            onClick={() => {
              const first = projects[0]?.project_name ?? "";
              setSelectedProject(first);
              computeBlastRadius(first);
              reheat();
            }}
          >
            <RotateCcw size={15} />
            Reset focus
          </button>
        </aside>
      </div>
    </div>
  );
}
