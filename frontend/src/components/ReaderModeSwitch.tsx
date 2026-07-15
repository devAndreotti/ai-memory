import { AlertTriangle, Bot, Clock3, GitBranch, LucideIcon, Route, ShieldCheck, Sparkles, User } from "lucide-react";
import type { PageKind, ReaderLink, ReaderPage } from "../types";

export type ReaderMode = "human" | "agent";

export function ReaderModeSwitch({ mode, onChange }: { mode: ReaderMode; onChange: (mode: ReaderMode) => void }) {
  return (
    <div className="reader-mode-switch" role="group" aria-label="Reader mode">
      <button type="button" className={mode === "human" ? "is-active" : ""} aria-pressed={mode === "human"} onClick={() => onChange("human")}>
        <User size={14} />
        Human
      </button>
      <button type="button" className={mode === "agent" ? "is-active" : ""} aria-pressed={mode === "agent"} onClick={() => onChange("agent")}>
        <Bot size={14} />
        Agent
      </button>
    </div>
  );
}

export function ReaderAgentView({ page, onOpenLink }: { page: ReaderPage; onOpenLink: (link: ReaderLink) => void }) {
  const rules = page.links.filter((link) => linkKind(link) === "rule");
  const decisions = page.links.filter((link) => linkKind(link) === "decision");
  const gotchaLinks = page.links.filter((link) => linkKind(link) === "gotcha");
  const missingLinks = page.links.filter((link) => link.status === "missing");
  const resolved = page.links.filter((link) => link.status === "resolved");
  const hint = page.retrieval_hint ?? `Use when an agent needs ${page.kind} context from ${page.project}.`;
  const noWarnings = page.kind !== "gotcha" && gotchaLinks.length === 0 && missingLinks.length === 0;

  return (
    <div className="agent-view" aria-label="Agent retrieval view">
      <section className="panel agent-section agent-hint-panel">
        <div className="panel-title">
          <Sparkles size={16} />
          <h3>Retrieval hint</h3>
        </div>
        <p className="agent-hint">{hint}</p>
      </section>

      <div className="agent-columns">
        <AgentLinkSection title="Rules" icon={ShieldCheck} links={rules} emptyLabel="No linked rules." onOpenLink={onOpenLink} />
        <AgentLinkSection title="Decisions" icon={GitBranch} links={decisions} emptyLabel="No linked decisions." onOpenLink={onOpenLink} />
      </div>

      <section className="panel agent-section">
        <div className="panel-title">
          <AlertTriangle size={16} />
          <h3>Gotchas & warnings</h3>
        </div>
        <div className="agent-link-stack">
          {page.kind === "gotcha" && (
            <p className="agent-note">
              This page is tagged <strong>gotcha</strong> — treat it as a caveat source.
            </p>
          )}
          {gotchaLinks.map((link) => (
            <AgentLinkRow key={`g-${link.project}/${link.path}`} link={link} tag={link.kind ?? "gotcha"} onOpenLink={onOpenLink} />
          ))}
          {missingLinks.map((link) => (
            <button
              className="agent-link-row is-missing"
              key={`m-${link.project}/${link.path}`}
              type="button"
              onClick={() => onOpenLink(link)}
            >
              <strong>{link.label}</strong>
              <small>{link.project}/{link.path}</small>
              <span>missing target</span>
            </button>
          ))}
          {noWarnings && <span className="agent-empty">No gotchas or broken links on this page.</span>}
        </div>
      </section>

      <section className="panel agent-section">
        <div className="panel-title">
          <Route size={16} />
          <h3>Paths</h3>
        </div>
        <div className="agent-paths">
          <div className="agent-path-row">
            <span>current</span>
            <code>{page.project}/{page.path}</code>
          </div>
          {resolved.map((link) => (
            <button className="agent-path-row is-link" key={`r-${link.project}/${link.path}`} type="button" onClick={() => onOpenLink(link)}>
              <span>link</span>
              <code>{link.project}/{link.path}</code>
            </button>
          ))}
          {page.backlinks.map((backlink) => (
            <button
              className="agent-path-row is-link"
              key={`b-${backlink.project}/${backlink.path}`}
              type="button"
              onClick={() => onOpenLink({ label: backlink.title, project: backlink.project, path: backlink.path, status: "resolved" })}
            >
              <span>backlink</span>
              <code>{backlink.project}/{backlink.path}</code>
            </button>
          ))}
        </div>
      </section>

      <section className="panel agent-section">
        <div className="panel-title">
          <Clock3 size={16} />
          <h3>Freshness</h3>
        </div>
        <dl className="agent-meta">
          <div>
            <dt>updated_at</dt>
            <dd>{formatTimestamp(page.updated_at)}</dd>
          </div>
          <div>
            <dt>tier</dt>
            <dd>{page.tier}</dd>
          </div>
          <div>
            <dt>kind</dt>
            <dd>
              <span className={`kind-chip kind-${page.kind}`}>{page.kind}</span>
            </dd>
          </div>
          <div>
            <dt>pinned</dt>
            <dd>{String(page.frontmatter.pinned)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function AgentLinkSection({
  title,
  icon: Icon,
  links,
  emptyLabel,
  onOpenLink,
}: {
  title: string;
  icon: LucideIcon;
  links: ReaderLink[];
  emptyLabel: string;
  onOpenLink: (link: ReaderLink) => void;
}) {
  return (
    <section className="panel agent-section">
      <div className="panel-title">
        <Icon size={16} />
        <h3>{title}</h3>
        <span className="agent-count">{links.length}</span>
      </div>
      <div className="agent-link-stack">
        {links.length === 0 ? (
          <span className="agent-empty">{emptyLabel}</span>
        ) : (
          links.map((link) => <AgentLinkRow key={`${link.project}/${link.path}`} link={link} tag={link.kind} onOpenLink={onOpenLink} />)
        )}
      </div>
    </section>
  );
}

function AgentLinkRow({ link, tag, onOpenLink }: { link: ReaderLink; tag?: PageKind; onOpenLink: (link: ReaderLink) => void }) {
  return (
    <button className={`agent-link-row is-${link.status}`} type="button" onClick={() => onOpenLink(link)}>
      <strong>{link.label}</strong>
      <small>{link.project}/{link.path}</small>
      {tag && <span className={`kind-chip kind-${tag}`}>{tag}</span>}
    </button>
  );
}

function linkKind(link: ReaderLink): PageKind | undefined {
  if (link.kind) return link.kind;
  if (link.path.startsWith("_rules/")) return "rule";
  if (link.path.startsWith("decisions/")) return "decision";
  return undefined;
}

function formatTimestamp(iso: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return match ? `${match[1]} ${match[2]} UTC` : iso;
}
