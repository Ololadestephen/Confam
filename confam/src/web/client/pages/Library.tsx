import { useState } from "react";
import { useRuns } from "../hooks.js";
import { Icon, Link, PageTitle } from "../shared.js";
import { duration, statusText } from "../format.js";
import { runPath } from "../routing.js";
export default function Library() {
  const { runs, loading, error, truncated } = useRuns();
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [status, setStatus] = useState("");
  const visible = runs.filter(
    (run) =>
      (!project || run.project === project) &&
      (!status || run.status === status) &&
      `${run.caseId} ${run.project} ${run.runId}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <main id="main" className="workspace">
      <PageTitle
        eyebrow="Your local workspace"
        title="A record worth keeping."
        action={
          <Link to="/runs/new" className="button button-dark">
            Prepare a run +
          </Link>
        }
      >
        Revisit a report. Inspect a repair. Pick up the thread.
      </PageTitle>
      <div className="library-stats">
        <div>
          <span className="tiny-dot" /> Local evidence library
        </div>
        <span>
          {runs.length} readable saved {runs.length === 1 ? "run" : "runs"}
        </span>
        <span>No application execution from this page</span>
      </div>
      <section className="library-panel" aria-label="Saved runs">
        <div className="filters">
          <label>
            <span className="sr-only">Search runs</span>
            <input
              type="search"
              placeholder="Search cases or projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Filter project</span>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">All projects</option>
              {[...new Set(runs.map((run) => run.project))].map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {[...new Set(runs.map((run) => run.status))].map((value) => (
                <option key={value} value={value}>
                  {statusText(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading ? (
          <p className="empty-state" role="status">
            Reading your saved runs…
          </p>
        ) : error ? (
          <p className="error-note" role="alert">
            {error}
          </p>
        ) : visible.length ? (
          <div className="run-list">
            {visible.map((run) => (
              <Link to={runPath(run.runId)} key={run.runId} className="run-row">
                <span className="run-row-icon">
                  <Icon name={run.fixture ? "layers" : "file"} />
                </span>
                <div>
                  <span className="eyebrow">
                    {run.project} {run.fixture ? "· scripted fixture" : ""}
                  </span>
                  <h2>{run.caseId}</h2>
                  <p>{run.verdict}</p>
                  <code>{run.runId}</code>
                </div>
                <div className="run-row-end">
                  <span className="pill">{statusText(run.status)}</span>
                  <span className="small muted">
                    {duration(run.durationMs)}
                  </span>
                  <span>↗</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Icon name="file" size={36} />
            <h2>
              {runs.length
                ? "No matching runs."
                : "Your next question starts here."}
            </h2>
            <p>
              {runs.length
                ? "Try a different filter or search."
                : "Prepare a report, run it through the CLI, then return to the evidence."}
            </p>
            {runs.length ? (
              <button
                className="button button-outline"
                onClick={() => {
                  setSearch("");
                  setProject("");
                  setStatus("");
                }}
              >
                Clear filters
              </button>
            ) : (
              <Link to="/runs/new" className="button button-dark">
                Prepare a run ↗
              </Link>
            )}
          </div>
        )}
      </section>
      {truncated ? (
        <p className="notice">
          This library is bounded to 200 candidate run directories. Some runs
          are not listed.
        </p>
      ) : null}
      <p className="small muted library-note">
        Only readable run reports directly inside the selected directory are
        listed. Invalid or incomplete metadata is omitted. Historical artifacts
        are unchanged.
      </p>
    </main>
  );
}
