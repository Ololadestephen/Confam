import { Artifact } from "../evidence.js";
import { Data, Link, PageTitle, Scope } from "../shared.js";
import type { RunView } from "../types.js";

export function Expectations({ run }: { run: RunView }) {
  return (
    <>
      <PageTitle eyebrow="01 / The report" title="What did “fixed” mean?">
        Recorded requirements define the scope. Historical confirmations are
        read-only.
      </PageTitle>
      {run.inputReport ? (
        <section className="panel report-paper">
          <span className="eyebrow">The written report</span>
          <p className="report-quote">{run.inputReport}</p>
        </section>
      ) : (
        <p className="notice">
          The written report was not included in this manifest.
        </p>
      )}
      <section className="section-block">
        <div className="section-heading">
          <h2>The recorded expectations</h2>
          <span className="pill">{run.expectations.length} statements</span>
        </div>
        {run.expectations.length ? (
          <div className="expectation-list">
            {run.expectations.map((item) => (
              <article className="expectation" key={item.id}>
                <code>{item.id}</code>
                <p>{item.statement}</p>
                <span aria-label="Read only">↳ recorded</span>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">
            No confirmed expectation statements were included. Recording
            suggestions are not confirmations.
          </p>
        )}
        <p className="notice">
          To change this scope, prepare a new case and explicitly accept it
          through the CLI. This page does not alter a frozen run.
        </p>
        <Link to="/runs/new" className="button button-outline">
          Prepare a new scope ↗
        </Link>
      </section>
      {run.recording || run.observations ? (
        <section className="section-block">
          <h2>The source recording</h2>
          <p className="muted">
            Model observations and suggested expectations require developer
            review.
          </p>
          {run.recording ? (
            <Artifact link={run.recording}>Open input recording</Artifact>
          ) : null}
          <Data
            title="Recording observations and uncertainties"
            value={run.observations}
            open
          />
        </section>
      ) : null}
      <Scope run={run} />
    </>
  );
}
