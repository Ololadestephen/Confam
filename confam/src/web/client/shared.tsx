import type { ReactNode } from "react";
import { pageUrl, runPath } from "./routing.js";
import type { RunView } from "./types.js";
import { duration, pretty, record } from "./format.js";
export function Link({
  to,
  className,
  children,
  ...props
}: { to: string; className?: string; children: ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return (
    <a href={pageUrl(to)} className={className} {...props}>
      {children}
    </a>
  );
}
export function Icon({
  name = "spark",
  size = 24,
}: {
  name?: string;
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    spark: (
      <path d="m12 2 2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3Z" />
    ),
    check: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="4" />
        <path d="m7 12 3 3 7-7M8 2v4m8-4v4" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 17l9 5 9-5" />
      </>
    ),
    file: (
      <>
        <path d="M6 2h9l4 4v16H6Z M14 2v5h5M9 12h7m-7 4h5" />
      </>
    ),
    play: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="4" />
        <path d="m10 9 5 3-5 3Z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.spark}
    </svg>
  );
}
export function Shell({
  children,
  page,
}: {
  children: ReactNode;
  page: string;
}) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="nav-wrap">
        <nav className="topnav" aria-label="Main navigation">
          <Link to="/" className="brand">
            <span className="brand-flower">✳</span> confam
          </Link>
          <div className="nav-links">
            <Link to="/" aria-current={page === "home" ? "page" : undefined}>
              Home
            </Link>
            <Link
              to="/runs"
              aria-current={page === "runs" ? "page" : undefined}
            >
              Runs
            </Link>
            <Link
              to="/guide"
              aria-current={page === "guide" ? "page" : undefined}
            >
              Guide
            </Link>
          </div>
          <Link to="/runs/new" className="button nav-cta">
            Prepare run
          </Link>
        </nav>
      </header>
      {children}
      <footer className="footer footer-compact">
        <Link to="/" className="brand">
          <span className="brand-flower">✳</span> confam
        </Link>
        <nav aria-label="Footer navigation">
          <Link to="/runs">Runs</Link>
          <Link to="/runs/new">Prepare run</Link>
          <Link to="/guide">Guide</Link>
        </nav>
      </footer>
    </>
  );
}
export function PageTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <h1>{title}</h1>
      {action}
    </header>
  );
}
export function RunNav({ run, active }: { run: RunView; active: string }) {
  return (
    <>
      <div className="breadcrumb">
        <Link to="/runs">Runs</Link>
        <span>/</span>
        <span>{run.project}</span>
        <span>/</span>
        <code>{run.caseId}</code>
      </div>
      <nav className="run-nav" aria-label="Run pages">
        {[
          ["verdict", "Overview", ""],
          ["expectations", "Expectations", "expectations"],
          ["live", "Activity", "live"],
          ["compare", "Compare", "compare"],
          ["checks", "Checks", "checks"],
        ].map(([page, label, suffix]) => (
          <Link
            key={page}
            to={runPath(run.runId, suffix)}
            aria-current={active === page ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
        <Link
          to={`/share/${encodeURIComponent(run.runId)}`}
          aria-current={active === "share" ? "page" : undefined}
        >
          Summary
        </Link>
      </nav>
      {run.fixture ? (
        <p className="fixture-note">
          <span className="stamp">Scripted fixture</span>
        </p>
      ) : null}
    </>
  );
}
export function Scope({ run }: { run: RunView }) {
  return (
    <aside className="limitations">
      <Icon name="file" />
      <div>
        <h3>Limitations</h3>
        <ul>
          {(run.limitations.length
            ? run.limitations
            : ["Evidence applies only to these recorded conditions."]
          ).map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
        <p>{run.independent.label}</p>
      </div>
    </aside>
  );
}
export function Metrics({ run }: { run: RunView }) {
  const cost = record(run.modelUsage)?.estimatedSpendUsd;
  const controls = run.variants.filter((v) => v.kind === "control");
  return (
    <div className="metric-grid">
      <div>
        <span className="metric-label">Development faults caught</span>
        <strong>
          {run.development
            ? `${run.development.caught} of ${run.development.total}`
            : "Not measured"}
        </strong>
        <p>
          {run.development
            ? `${run.development.survived} survived · ${run.development.uncounted} uncounted`
            : "No qualified fault count supplied"}
        </p>
      </div>
      <div>
        <span className="metric-label">Controls passed</span>
        <strong>
          {controls.length
            ? `${controls.filter((v) => v.outcome === "passed").length} of ${controls.length}`
            : "Not supplied"}
        </strong>
        <p>
          {controls.length
            ? "Passed"
            : "False-rejection calibration unavailable"}
        </p>
      </div>
      <div>
        <span className="metric-label">Independent evaluation</span>
        <strong>
          {run.independent.evaluated
            ? run.independent.complete === false
              ? "Incomplete"
              : "Recorded"
            : "Not performed"}
        </strong>
      </div>
      <div>
        <span className="metric-label">Time / model estimate</span>
        <strong>{duration(run.durationMs)}</strong>
        <p>
          {typeof cost === "number"
            ? `$${cost.toFixed(6)} estimated`
            : "Model usage not recorded"}
        </p>
      </div>
    </div>
  );
}
export function Data({
  title,
  value,
  open = false,
}: {
  title: string;
  value: unknown;
  open?: boolean;
}) {
  return (
    <details className="data-detail" open={open}>
      <summary>{title}</summary>
      <pre>{pretty(value)}</pre>
    </details>
  );
}
