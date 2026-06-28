import { BookOpenText, Check, Clock3, Copy, FileX, Files, FolderOpen, Ghost, LucideIcon, ShieldAlert, Unlink } from "lucide-react";
import { useState } from "react";
import type { DriftIssueType, MemoryDriftIssue } from "../types";

interface DriftAuditProps {
  issues: MemoryDriftIssue[];
  onOpenMissingPage: () => void;
  onOpenProject: (project: string) => void;
  onOpenPage: (project: string, path: string) => void;
}

const TYPE_META: Record<DriftIssueType, { label: string; icon: LucideIcon }> = {
  "missing-page": { label: "Missing on disk", icon: FileX },
  "empty-project": { label: "Empty project", icon: FolderOpen },
  orphan: { label: "Orphan", icon: Ghost },
  "broken-backlink": { label: "Broken backlink", icon: Unlink },
  duplicate: { label: "Duplicate", icon: Files },
  stale: { label: "Stale", icon: Clock3 },
};

const TYPE_ORDER: DriftIssueType[] = ["missing-page", "empty-project", "orphan", "broken-backlink", "duplicate", "stale"];

export function DriftAudit({ issues, onOpenMissingPage, onOpenProject, onOpenPage }: DriftAuditProps) {
  const [typeFilter, setTypeFilter] = useState<DriftIssueType | "all">("all");
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState("");

  const counts = TYPE_ORDER.reduce<Record<string, number>>((acc, type) => {
    acc[type] = issues.filter((issue) => issue.type === type).length;
    return acc;
  }, {});

  const visible = typeFilter === "all" ? issues : issues.filter((issue) => issue.type === typeFilter);
  const openIssues = issues.filter((issue) => !reviewed.has(issue.id)).length;

  const toggleReviewed = (id: string) => {
    setReviewed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyPath = (issue: MemoryDriftIssue) => {
    const value = issue.path ? `${issue.project}/${issue.path}` : issue.project;
    void navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopiedId(issue.id);
    window.setTimeout(() => setCopiedId(""), 1600);
  };

  const openIssue = (issue: MemoryDriftIssue) => {
    if (issue.type === "missing-page") return onOpenMissingPage();
    if (issue.type === "empty-project") return onOpenProject(issue.project);
    return onOpenPage(issue.project, issue.path);
  };

  return (
    <div className="drift-audit">
      <section className="drift-head">
        <div>
          <p className="section-kicker">memory hygiene</p>
          <h2>Memory drift audit</h2>
          <p>Read-only diff between the index and disk. {openIssues} of {issues.length} issues still need review.</p>
        </div>
        <div className="drift-summary">
          <ShieldAlert size={22} />
          <strong>{issues.length}</strong>
          <span>tracked issues</span>
        </div>
      </section>

      <div className="drift-filter-bar" role="group" aria-label="Filter by issue type">
        <button className={`drift-chip ${typeFilter === "all" ? "is-active" : ""}`} type="button" aria-pressed={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
          All
          <span>{issues.length}</span>
        </button>
        {TYPE_ORDER.map((type) => {
          const Icon = TYPE_META[type].icon;
          return (
            <button
              className={`drift-chip ${typeFilter === type ? "is-active" : ""}`}
              key={type}
              type="button"
              aria-pressed={typeFilter === type}
              onClick={() => setTypeFilter(type)}
            >
              <Icon size={13} />
              {TYPE_META[type].label}
              <span>{counts[type]}</span>
            </button>
          );
        })}
      </div>

      <div className="drift-list" role="table" aria-label="Drift issues">
        {visible.map((issue) => {
          const meta = TYPE_META[issue.type];
          const isReviewed = reviewed.has(issue.id);
          return (
            <article className={`drift-row ${isReviewed ? "is-reviewed" : ""}`} key={issue.id} role="row">
              <div className="drift-row-lead">
                <span className={`drift-sev drift-sev-${issue.severity}`}>{issue.severity}</span>
                <span className="drift-type-chip">
                  <meta.icon size={13} />
                  {meta.label}
                </span>
                {isReviewed && <span className="drift-reviewed-chip">reviewed</span>}
              </div>
              <div className="drift-row-body">
                <strong>{issue.title}</strong>
                <code>{issue.path ? `${issue.project}/${issue.path}` : issue.project}</code>
                <p>{issue.explanation}</p>
              </div>
              <div className="drift-actions">
                {issue.type === "empty-project" ? (
                  <button className="small-action" type="button" onClick={() => openIssue(issue)}>
                    <FolderOpen size={14} />
                    Open project
                  </button>
                ) : (
                  <button className="small-action" type="button" onClick={() => openIssue(issue)}>
                    <BookOpenText size={14} />
                    Open reader
                  </button>
                )}
                {issue.path && (
                  <button className="small-action" type="button" onClick={() => copyPath(issue)}>
                    {copiedId === issue.id ? <Check size={14} /> : <Copy size={14} />}
                    {copiedId === issue.id ? "Copied" : "Copy path"}
                  </button>
                )}
                <button className={`small-action ${isReviewed ? "is-reviewed-action" : ""}`} type="button" onClick={() => toggleReviewed(issue.id)}>
                  <Check size={14} />
                  {isReviewed ? "Unmark" : "Mark reviewed"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
