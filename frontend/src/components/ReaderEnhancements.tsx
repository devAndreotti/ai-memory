import { Check, Copy, Database, GitBranch, Link2, ListTree } from "lucide-react";
import { useState } from "react";
import type { ReaderLink, ReaderPage } from "../types";

interface ReaderEnhancementsProps {
  page: ReaderPage;
  onOpenLink: (link: ReaderLink) => void;
}

export function ReaderEnhancements({ page, onOpenLink }: ReaderEnhancementsProps) {
  const [copied, setCopied] = useState(false);
  const headings = extractHeadings(page.body);

  const copyPath = async () => {
    await navigator.clipboard.writeText(`${page.project}/${page.path}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <aside className="metadata-rail reader-tools">
      <section className="panel path-panel">
        <div className="panel-title">
          <Copy size={16} />
          <h3>Path</h3>
        </div>
        <code>{page.project}/{page.path}</code>
        <button className="small-action" type="button" onClick={() => void copyPath()}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy path"}
        </button>
      </section>

      <details className="panel disclosure-panel" open={!page.missing}>
        <summary>
          <span>
            <Database size={16} />
            Frontmatter
          </span>
        </summary>
        <dl className="meta-list">
          <div>
            <dt>tier</dt>
            <dd>{page.tier}</dd>
          </div>
          <div>
            <dt>pinned</dt>
            <dd>{String(page.frontmatter.pinned)}</dd>
          </div>
          <div>
            <dt>tags</dt>
            <dd>{page.frontmatter.tags.join(", ")}</dd>
          </div>
          {page.frontmatter.source && (
            <div>
              <dt>source</dt>
              <dd>{page.frontmatter.source}</dd>
            </div>
          )}
        </dl>
      </details>

      <section className="panel">
        <div className="panel-title">
          <ListTree size={16} />
          <h3>Table of contents</h3>
        </div>
        <div className="toc-list">
          {headings.length === 0 ? (
            <span className="empty-note">No headings indexed.</span>
          ) : (
            headings.map((heading) => (
              <a href={`#${heading.id}`} key={heading.id}>
                {heading.text}
              </a>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <Link2 size={16} />
          <h3>Resolved links</h3>
        </div>
        <div className="link-stack">
          {page.links.length === 0 ? (
            <span className="empty-note">No wikilinks on this page.</span>
          ) : (
            page.links.map((link) => (
              <button className={`link-row is-${link.status}`} key={`${link.project}/${link.path}`} type="button" onClick={() => onOpenLink(link)}>
                <strong>{link.label}</strong>
                <small>{link.project}/{link.path}</small>
                <span>{link.status}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <GitBranch size={16} />
          <h3>Backlinks</h3>
        </div>
        <div className="link-stack">
          {page.backlinks.length === 0 ? (
            <span className="empty-note">No backlink fixture for this mock page.</span>
          ) : (
            page.backlinks.map((backlink) => (
              <button
                className="link-row backlink-row"
                key={`${backlink.project}/${backlink.path}`}
                type="button"
                onClick={() => onOpenLink({ label: backlink.title, project: backlink.project, path: backlink.path, status: "resolved" })}
              >
                <strong>{backlink.title}</strong>
                <small>{backlink.project}/{backlink.path}</small>
                <span>{backlink.context}</span>
              </button>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}

export function extractHeadings(body: string) {
  return body
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => {
      const text = line.slice(3).trim();
      return { text, id: headingId(text) };
    });
}

export function headingId(text: string) {
  return `reader-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}
