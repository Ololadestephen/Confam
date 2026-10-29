import { Artifact } from "../evidence.js";
import { Data, Link, PageTitle, Scope } from "../shared.js";
import type { RunView } from "../types.js";

export function Expectations({ run }: { run: RunView }) {
  return (
    <>
      <PageTitle title="Expectations"></PageTitle>
      {run.inputReport ? (
        <section className="panel report-paper">
          <h2>Report</h2>
          <p className="report-quote">{run.inputReport}</p>
        </section>
      ) : (
        <p className="notice">
          The written report was not included in this manifest.
        </p>
      )}
      <section className="section-block">
        <div className="section-heading">
          <h2>Requirements</h2>
          <span className="pill">{run.expectations.length} statements</span>
        </div>
        {run.expectations.length ? (
          <div className="expectation-list">
            {run.expectations.map((item) => (
              <article className="expectation" key={item.id}>
                <code>{item.id}</code>
                <p>{item.statement}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">
            No confirmed expectation statements were included. Recording
            suggestions are not confirmations.
          </p>
        )}
        <span className="pill">Read only</span>
        <Link to="/runs/new" className="button button-outline">
          Prepare a new scope
        </Link>
      </section>
      {run.recording || run.observations ? (
        <section className="section-block">
          <h2>The source recording</h2>
          <span className="pill">Unconfirmed</span>
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
