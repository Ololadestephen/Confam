import type { ExecutionJob } from "../../../jobs/contracts.js";
import { Link } from "../shared.js";

function Details({
  title,
  value,
  open = false,
}: {
  title: string;
  value: unknown;
  open?: boolean;
}) {
  return (
    <details open={open}>
      <summary style={{ overflowWrap: "anywhere" }}>{title}</summary>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
export function JobReview({
  job,
  approved,
  setApproved,
  busy,
  start,
}: {
  job: ExecutionJob;
  approved: boolean;
  setApproved: (value: boolean) => void;
  busy: boolean;
  start: () => void;
}) {
  const p = job.preview;
  return (
    <section className="form-panel" style={{ overflowWrap: "anywhere" }}>
      <span className="pill">Ready to review</span>
      <h2>Reviewed execution snapshot</h2>
      <p>
        Source: {p.root} · {p.manifest.files.length} files · {p.manifest.bytes}{" "}
        bytes
      </p>
      <Details title="Command" value={p.command} open />
      <Details
        title="Snapshot identity"
        value={{
          approval: p.hash,
          source: p.manifest.sha256,
          confirmation: p.confirmationHash,
          executor: p.toolHash,
        }}
      />
      <h3>Confirmed expectations</h3>
      <ul>
        {p.definition.expectations.map((item) => (
          <li key={item.id}>
            {item.id}: {item.statement}
          </li>
        ))}
      </ul>
      <p>Reproduction targets: {p.definition.reproductionTargets.join(", ")}</p>
      <Details title="Source manifest" value={p.manifest} />
      <Details title="Project configuration" value={p.configuration} />
      <Details title="Case and fixture data" value={p.definition} />
      <Details title="Workflow" value={p.workflow} />
      {p.candidate ? (
        <Details
          title={`Candidate patch: ${p.candidate.name} · ${p.candidate.bytes} bytes`}
          value={p.candidate.text}
        />
      ) : (
        <p>No candidate patch selected.</p>
      )}
      <h3>Execution scope</h3>
      <ul>
        {p.limitations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <label>
        <input
          type="checkbox"
          checked={approved}
          onChange={(event) => setApproved(event.target.checked)}
        />{" "}
        I approve running this reviewed snapshot
      </label>
      <div className="form-actions">
        <button
          className="button button-dark"
          disabled={!approved || busy}
          onClick={start}
        >
          Start verification
        </button>
      </div>
    </section>
  );
}
export function JobProgress({
  job,
  busy,
  cancel,
}: {
  job: ExecutionJob;
  busy: boolean;
  cancel: () => void;
}) {
  const active = job.status === "running" || job.status === "cancelling";
  return (
    <section
      className="form-panel"
      style={{ overflowWrap: "anywhere" }}
      aria-live="polite"
    >
      <span className="pill">{job.status}</span>
      <h2>Verification {job.status}</h2>
      {job.phase && <p>Current phase: {job.phase}</p>}
      {job.verdict && <p>{job.verdict}</p>}
      {job.error && <p className="error-note">{job.error}</p>}
      {(job.status === "cancelled" || job.status === "interrupted") && (
        <p>This run is incomplete. There is no candidate verdict.</p>
      )}
      {job.cleanupComplete === true && <p>Cleanup complete.</p>}
      {job.cleanupComplete === false && <p>Cleanup is unconfirmed.</p>}
      {active && (
        <button
          className="button button-outline"
          disabled={busy || job.status === "cancelling"}
          onClick={cancel}
        >
          {job.status === "cancelling" ? "Cancelling…" : "Cancel verification"}
        </button>
      )}
      {job.runId && (
        <p>
          <Link
            className="button button-dark"
            to={`/runs/${encodeURIComponent(job.runId)}`}
          >
            Open run evidence
          </Link>
        </p>
      )}
      <h3>Runner events</h3>
      {job.events.length ? (
        <ol>
          {job.events.map((event) => (
            <li key={event.sequence}>
              <time>{event.at}</time> · {event.phase}
              {event.variantId ? ` · ${event.variantId}` : ""}
              {event.kind ? ` · ${event.kind}` : ""}
              {event.stepIndex !== undefined
                ? ` · step ${event.stepIndex}`
                : ""}
              {event.action ? ` · ${event.action}` : ""}
              {event.outcome ? ` · ${event.outcome}` : ""}
            </li>
          ))}
        </ol>
      ) : (
        <p>No runner events yet.</p>
      )}
    </section>
  );
}
