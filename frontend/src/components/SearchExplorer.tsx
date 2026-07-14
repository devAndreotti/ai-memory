import { FileText, Filter, FolderOpen, FolderTree, LucideIcon, Search, TextSearch } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { MemoryTier, PageKind, SearchResult, SearchResultType } from "../types";

// Decode the five HTML entities the server's `escape_snippet` can emit.
// `&amp;` is decoded last so `&amp;lt;` round-trips to the literal `&lt;`
// rather than collapsing to `<`.
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// Render an FTS snippet WITHOUT `dangerouslySetInnerHTML`. The only markup
// the snippet is allowed to carry is the fixed `<mark>` highlight pair;
// everything else is treated as text and rendered through React (which
// auto-escapes), so page-body HTML can never execute here — defense in
// depth even if the server ever stops escaping. Segments are entity-decoded
// so escaped bodies still display their literal characters correctly.
function renderSnippet(snippet: string): ReactNode {
  return snippet.split(/<\/?mark>/).map((segment, i) => {
    const text = decodeEntities(segment);
    // Odd indices are the spans that sat between <mark> and </mark>.
    return i % 2 === 1 ? <mark key={i}>{text}</mark> : <Fragment key={i}>{text}</Fragment>;
  });
}

interface SearchExplorerProps {
  query: string;
  results: SearchResult[];
  onOpenProject: (project: string) => void;
  onOpenResult: (result: SearchResult) => void;
}

const GROUPS: { type: SearchResultType; label: string; icon: LucideIcon }[] = [
  { type: "project", label: "Projects", icon: FolderOpen },
  { type: "page", label: "Pages", icon: FileText },
  { type: "path", label: "Paths", icon: FolderTree },
  { type: "content", label: "Content hits", icon: TextSearch },
];

const KIND_OPTIONS: PageKind[] = ["rule", "decision", "fact", "gotcha"];
const TIER_OPTIONS: MemoryTier[] = ["working", "episodic", "semantic", "procedural"];

export function SearchExplorer({ query, results, onOpenProject, onOpenResult }: SearchExplorerProps) {
  const [projectFilter, setProjectFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<PageKind | "all">("all");
  const [tierFilter, setTierFilter] = useState<MemoryTier | "all">("all");

  const projectOptions = useMemo(() => Array.from(new Set(results.map((result) => result.project))).sort(), [results]);

  const filtered = results.filter((result) => {
    if (projectFilter !== "all" && result.project !== projectFilter) return false;
    if (kindFilter !== "all" && result.kind !== kindFilter) return false;
    if (tierFilter !== "all" && result.tier !== tierFilter) return false;
    return true;
  });

  const groups = GROUPS.map((group) => ({ ...group, items: filtered.filter((result) => result.type === group.type) })).filter(
    (group) => group.items.length > 0,
  );

  return (
    <div className="content-flow search-explorer">
      <section className="search-results">
        <div className="section-head">
          <div>
            <p className="section-kicker">grouped search</p>
            <h2>{query ? `Results for "${query}"` : "All indexed results"}</h2>
          </div>
          <span>{filtered.length} of {results.length} results</span>
        </div>

        <div className="search-filters" aria-label="Search filters">
          <FilterRow
            label="Project"
            options={projectOptions}
            active={projectFilter}
            onSelect={setProjectFilter}
          />
          <FilterRow
            label="Kind"
            options={KIND_OPTIONS}
            active={kindFilter}
            onSelect={(value) => setKindFilter(value as PageKind | "all")}
          />
          <FilterRow
            label="Tier"
            options={TIER_OPTIONS}
            active={tierFilter}
            onSelect={(value) => setTierFilter(value as MemoryTier | "all")}
          />
        </div>

        {groups.length === 0 ? (
          <div className="search-empty">
            <Filter size={20} />
            <strong>No results for these filters</strong>
            <span>Clear a filter or widen the query in the command bar.</span>
          </div>
        ) : (
          <div className="search-groups">
            {groups.map((group) => (
              <section className="search-group" key={group.type}>
                <header className="search-group-head">
                  <group.icon size={15} />
                  <h3>{group.label}</h3>
                  <span>{group.items.length}</span>
                </header>
                <div className="search-group-rows">
                  {group.items.map((result) =>
                    result.type === "project" ? (
                      <button className="search-result-row is-project" key={result.id} type="button" onClick={() => onOpenProject(result.project)}>
                        <span className="search-result-main">
                          <strong>{result.title}</strong>
                          <small>{result.detail}</small>
                        </span>
                        <span className="search-result-tags">
                          <span className="result-type-chip">project</span>
                        </span>
                      </button>
                    ) : (
                      <button className="search-result-row" key={result.id} type="button" onClick={() => onOpenResult(result)}>
                        <span className="search-result-main">
                          <strong>{result.title}</strong>
                          <small>{result.detail}</small>
                          {result.snippet && <span className="search-snippet">{renderSnippet(result.snippet)}</span>}
                        </span>
                        <span className="search-result-tags">
                          {result.kind && <span className={`kind-chip kind-${result.kind}`}>{result.kind}</span>}
                          {result.tier && <span className="tier-chip">{result.tier}</span>}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FilterRow({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: string[];
  active: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="filter-group" role="group" aria-label={`${label} filter`}>
      <span className="filter-label">
        <Search size={12} />
        {label}
      </span>
      <div className="filter-chips">
        <button className={`filter-chip ${active === "all" ? "is-active" : ""}`} type="button" aria-pressed={active === "all"} onClick={() => onSelect("all")}>
          All
        </button>
        {options.map((option) => (
          <button
            className={`filter-chip ${active === option ? "is-active" : ""}`}
            key={option}
            type="button"
            aria-pressed={active === option}
            onClick={() => onSelect(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
