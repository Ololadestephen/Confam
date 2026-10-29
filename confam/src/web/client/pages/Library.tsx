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
        title="Runs"
        action={
          <Link to="/runs/new" className="button button-dark">
            Prepare run
          </Link>
        }
      ></PageTitle>
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
          <table className="runs-table">
            <thead>
              <tr>
                <th scope="col">Case</th>
                <th scope="col">Project</th>
                <th scope="col">Status</th>
                <th scope="col">Duration</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((run) => (
                <tr key={run.runId}>
                  <td>
                    <Link
                      to={runPath(run.runId)}
                      aria-label={`${run.caseId} ${run.runId}`}
                      title={run.runId}
                    >
                      {run.caseId}
                    </Link>
                  </td>
                  <td>
                    {run.project}
                    {run.fixture ? (
                      <span className="stamp">Fixture</span>
                    ) : null}
                  </td>
                  <td>
                    <span className="pill">{statusText(run.status)}</span>
                  </td>
                  <td>
                    {run.durationMs === undefined
                      ? "—"
                      : duration(run.durationMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <Icon name="file" size={36} />
            <h2>{runs.length ? "No matching runs." : "No saved runs."}</h2>

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
                Prepare a run
              </Link>
            )}
          </div>
        )}
      </section>
      {truncated ? (
        <p className="notice">First 200 run directories shown.</p>
      ) : null}
    </main>
  );
}
