import { apiUrl } from "../api.js";
import { Link, PageTitle } from "../shared.js";
import { runPath } from "../routing.js";
import type { RunView } from "../types.js";

export function Summary({ run }: { run: RunView }) {
  return (
    <>
      <PageTitle title="Summary"></PageTitle>
      <section className="summary-paper">
        <span className="paper-star">✳</span>
        <p className="eyebrow">
          {run.project} / {run.caseId}
        </p>
        <h2>{run.verdict}</h2>
        {run.fixture ? <p className="fixture-note">Scripted fixture</p> : null}
        <h3>Expectations</h3>
        {run.expectations.length ? (
          <ul>
            {run.expectations.map((item) => (
              <li key={item.id}>{item.statement}</li>
            ))}
          </ul>
        ) : (
          <p>No confirmed expectations included in this report.</p>
        )}
        <h3>Limitations</h3>
        <ul>
          {run.limitations.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
        <p>{run.independent.label}</p>
        <a
          className="button button-dark"
          href={apiUrl("/api/export", run.runId)}
          download
        >
          Export redacted summary
        </a>
        <dl className="review-facts">
          <div>
            <dt>Export</dt>
            <dd>Local JSON</dd>
          </div>
          <div>
            <dt>Excluded</dt>
            <dd>Recordings, traces, logs, source, local artifact links</dd>
          </div>
          <div>
            <dt>Redaction</dt>
            <dd>Best effort; review before sharing</dd>
          </div>
        </dl>
      </section>
      <Link to={runPath(run.runId)} className="text-link">
        Overview
      </Link>
    </>
  );
}
