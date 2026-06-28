import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Copy,
  Database,
  FileJson,
  FileQuestion,
  FolderOpen,
  GitBranch,
  History,
  KeyRound,
  ListChecks,
  ListTree,
  Loader2,
  RefreshCw,
  RotateCcw,
  Terminal,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import type { ApiScenario } from "../types";

interface ApiStatePanelsProps {
  scenarios: ApiScenario[];
  activeId: string;
  onSelect: (scenario: ApiScenario) => void;
  onOpenMissingPage: () => void;
  onOpenEmptyProject: () => void;
}

interface ActionLogEntry {
  id: string;
  label: string;
  detail?: string;
  time: string;
  tone: string;
}

const tokenCommand = "export AI_MEMORY_READ_TOKEN=rd_live_mock_3f9a8b21c0";
const missingPath = "onemob-app/notes/callback-contract.md";

export function ApiStatePanels({ scenarios, activeId, onSelect, onOpenMissingPage, onOpenEmptyProject }: ApiStatePanelsProps) {
  const active = scenarios.find((scenario) => scenario.id === activeId) ?? scenarios[0];
  const [log, setLog] = useState<ActionLogEntry[]>([]);
  const [lastRetry, setLastRetry] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const now = () => new Date().toLocaleTimeString();
  const pushLog = (entry: Omit<ActionLogEntry, "id" | "time">) =>
    setLog((current) => [{ ...entry, id: `${Date.now()}-${current.length}`, time: now() }, ...current].slice(0, 8));

  const copy = (value: string, label: string, detail?: string, tone = "copy") => {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
    pushLog({ label, detail, tone });
  };

  const retry = () => {
    const stamp = now();
    setLastRetry(stamp);
    pushLog({ label: "Retried API request", detail: `${active.code} ${active.title}`, tone: "retry" });
  };

  const copyDiagnosticBundle = () => {
    const bundle = JSON.stringify(
      {
        scenario: active.id,
        code: active.code,
        status: active.status,
        path: active.tone === "missing" ? missingPath : null,
        timestamp: new Date().toISOString(),
        recovery: active.recovery,
      },
      null,
      2,
    );
    copy(bundle, "Copied diagnostic bundle", active.id, "bundle");
  };

  const resetSimulation = () => {
    setLog([]);
    setLastRetry("");
    setChecked(new Set());
    if (scenarios[0]) onSelect(scenarios[0]);
  };

  const toggleCheck = (key: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onSwitcherKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = scenarios.findIndex((scenario) => scenario.id === active.id);
    const nextIndex = event.key === "ArrowDown" ? Math.min(index + 1, scenarios.length - 1) : Math.max(index - 1, 0);
    if (scenarios[nextIndex]) onSelect(scenarios[nextIndex]);
  };

  const systemState = active.tone === "empty" ? "Empty" : active.tone === "loading" ? "Loading" : "Degraded";
  const cachedData =
    active.tone === "loading" ? "Warming cache" : active.tone === "offline" ? "Serving stale cache" : "Last good cache held";

  return (
    <div className="state-lab">
      <section className="state-status-band" aria-label="System status">
        <div className="state-status-cells">
          <StatusCell label="System state" value={systemState} tone={active.tone} dotted />
          <StatusCell label="Active failure" value={`${active.code} · ${active.title}`} />
          <StatusCell label="Last retry" value={lastRetry || "—"} />
          <StatusCell label="Cached data" value={cachedData} />
        </div>
        <div className="state-band-actions">
          <button className="small-action" type="button" onClick={copyDiagnosticBundle}>
            <FileJson size={15} />
            Copy diagnostic bundle
          </button>
          <button className="small-action" type="button" onClick={resetSimulation}>
            <RotateCcw size={15} />
            Reset simulation
          </button>
        </div>
      </section>

      <div className="state-main">
        <div className="state-detail-col">
          <section className={`state-detail tone-${active.tone}`} aria-label="Scenario detail">
            <div className="state-detail-head">
              <span className="state-detail-icon">{iconFor(active)}</span>
              <div className="state-detail-titles">
                <p className="section-kicker">{active.status}</p>
                <h2>{active.title}</h2>
              </div>
              <span className="state-code">{active.code}</span>
            </div>
            <p className="state-detail-body">{active.body}</p>
            <p className="state-detail-recovery">{active.recovery}</p>
            <div className="state-actions" aria-label={`${active.title} actions`}>
              {active.tone === "auth" && (
                <button className="small-action" type="button" onClick={() => copy(tokenCommand, "Copied token command", tokenCommand)}>
                  <Terminal size={15} />
                  Copy token command
                </button>
              )}
              {active.tone === "offline" && (
                <button className="small-action" type="button" onClick={retry}>
                  <RefreshCw size={15} />
                  Retry
                </button>
              )}
              {active.tone === "empty" && (
                <button
                  className="small-action"
                  type="button"
                  onClick={() => {
                    pushLog({ label: "Opened empty project", detail: "scriply-old-746d84d", tone: "open" });
                    onOpenEmptyProject();
                  }}
                >
                  <FolderOpen size={15} />
                  Open project
                </button>
              )}
              {active.tone === "missing" && (
                <>
                  <button className="small-action" type="button" onClick={() => copy(missingPath, "Copied path", missingPath)}>
                    <Copy size={15} />
                    Copy path
                  </button>
                  <button
                    className="small-action"
                    type="button"
                    onClick={() => {
                      pushLog({ label: "Opened missing backlinks", detail: missingPath, tone: "open" });
                      onOpenMissingPage();
                    }}
                  >
                    <GitBranch size={15} />
                    Open backlinks
                  </button>
                </>
              )}
              {active.tone === "loading" && (
                <>
                  <button className="small-action" type="button" disabled aria-disabled="true">
                    <Loader2 size={15} />
                    Awaiting response…
                  </button>
                  <button className="small-action" type="button" onClick={() => copy("warm-cache", "Served warm cache", "from local snapshot", "open")}>
                    <Database size={15} />
                    Serve warm cache
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="panel recovery-checklist" aria-label="Recovery checklist">
            <div className="panel-title">
              <ListChecks size={16} />
              <h3>Recovery checklist</h3>
              <span className="agent-count">
                {active.checklist.filter((_, index) => checked.has(`${active.id}:${index}`)).length}/{active.checklist.length}
              </span>
            </div>
            <ul className="checklist">
              {active.checklist.map((step, index) => {
                const key = `${active.id}:${index}`;
                const done = checked.has(key);
                return (
                  <li key={key}>
                    <button className={`checklist-item ${done ? "is-done" : ""}`} type="button" aria-pressed={done} onClick={() => toggleCheck(key)}>
                      {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                      <span>{step}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="state-rail">
          <section className="panel scenario-switcher" aria-label="Scenario switcher">
            <div className="panel-title">
              <ListTree size={16} />
              <h3>Scenarios</h3>
            </div>
            <div className="switcher-list" role="listbox" aria-label="Failure scenarios" tabIndex={0} onKeyDown={onSwitcherKeyDown}>
              {scenarios.map((scenario) => (
                <button
                  className={`switcher-item state-${scenario.tone} ${scenario.id === active.id ? "is-active" : ""}`}
                  key={scenario.id}
                  type="button"
                  role="option"
                  aria-selected={scenario.id === active.id}
                  onClick={() => onSelect(scenario)}
                >
                  {iconFor(scenario)}
                  <span>
                    <strong>{scenario.title}</strong>
                    <small>{scenario.status}</small>
                  </span>
                  <code>{scenario.code}</code>
                </button>
              ))}
            </div>
          </section>

          <section className="panel action-log" aria-label="Action log">
            <div className="panel-title">
              <History size={16} />
              <h3>Action log</h3>
              <span className="agent-count">{log.length}</span>
            </div>
            {log.length === 0 ? (
              <span className="empty-note">No simulated actions yet. Trigger a recovery action above.</span>
            ) : (
              <ul className="action-log-list">
                {log.map((entry) => (
                  <li className={`action-log-row tone-${entry.tone}`} key={entry.id}>
                    <span className="action-log-time">{entry.time}</span>
                    <strong>{entry.label}</strong>
                    {entry.detail && <code>{entry.detail}</code>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatusCell({ label, value, tone, dotted }: { label: string; value: string; tone?: string; dotted?: boolean }) {
  return (
    <div className={`status-cell ${tone ? `tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>
        {dotted && <i className="status-dot" aria-hidden="true" />}
        {value}
      </strong>
    </div>
  );
}

function iconFor(scenario: ApiScenario) {
  if (scenario.tone === "auth") return <KeyRound size={22} />;
  if (scenario.tone === "offline") return <WifiOff size={22} />;
  if (scenario.tone === "empty") return <FolderOpen size={22} />;
  if (scenario.tone === "missing") return <FileQuestion size={22} />;
  if (scenario.tone === "loading") return <Loader2 size={22} />;
  return <AlertTriangle size={22} />;
}
