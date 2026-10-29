import { apiUrl } from "../api.js";
import { Link, PageTitle } from "../shared.js";
import { runPath } from "../routing.js";
import type { RunView } from "../types.js";

export function Summary({ run }: { run: RunView }) {
  return (
    <>
      <PageTitle
        eyebrow="Local summary preview"
        title="The result, with its context."
      >
        A plain-language view to review before exporting. This is not a hosted
        share link.
      </PageTitle>
      <section className="summary-paper">
        <span className="paper-star">✳</span>
        <p className="eyebrow">
          {run.project} / {run.caseId}
        </p>
        <h2>{run.verdict}</h2>
        {run.fixture ? (
          <p className="fixture-note">
            Scripted fixture inputs. Independent evaluation is separate.
          </p>
        ) : null}
        <h3>What was being checked</h3>
        {run.expectations.length ? (
          <ul>
            {run.expectations.map((item) => (
              <li key={item.id}>{item.statement}</li>
            ))}
          </ul>
        ) : (
          <p>No confirmed expectations included in this report.</p>
        )}
        <h3>What remains uncertain</h3>
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
          Export redacted summary ↓
        </a>
        <p className="small muted">
          The JSON summary excludes recordings, traces, logs, source and local
          links. Redaction is best effort. Review the file before sharing it.
        </p>
      </section>
      <Link to={runPath(run.runId)} className="text-link">
        ← Back to the full evidence
      </Link>
    </>
  );
}
