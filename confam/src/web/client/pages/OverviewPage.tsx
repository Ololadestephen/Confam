import { AssertionList, Artifact, Status, VariantDetail } from "../evidence.js";
import { Data, Icon, Link, Metrics, Scope } from "../shared.js";
import { runPath } from "../routing.js";
import type { RunView } from "../types.js";

export function Overview({ run }: { run: RunView }) {
  const candidate = run.variants.find((v) => v.kind === "candidate");
  const original = run.variants.find((v) => v.kind === "original");
  return (
    <>
      <div className="verdict-card">
        <div className="verdict-symbol">
          <Icon name="file" size={40} />
        </div>
        <div>
          <p className="eyebrow">The recorded verdict</p>
          <h1>{run.verdict}</h1>
          <div className="button-row">
            <Link
              to={runPath(run.runId, "compare")}
              className="button button-dark"
            >
              Open comparison
            </Link>
            <Link
              to={`/share/${encodeURIComponent(run.runId)}`}
              className="button button-outline"
            >
              Summary preview
            </Link>
          </div>
        </div>
      </div>
      <Metrics run={run} />
      <Scope run={run} />
      <div className="two-columns section-block">
        <div className="panel">
          <span className="eyebrow">The reproduction</span>
          <h2>Start with the original.</h2>
          {original ? (
            <>
              <Status value={original.outcome} kind="original" />
              <AssertionList assertions={original.assertions} />
            </>
          ) : (
            <p>No original execution result was supplied.</p>
          )}
        </div>
        <div className="panel">
          <span className="eyebrow">The proposed repair</span>
          <h2>What changed in behavior?</h2>
          {candidate ? (
            <>
              <Status value={candidate.outcome} />
              <AssertionList assertions={candidate.assertions} />
              {candidate.patch ? (
                <Artifact link={candidate.patch}>
                  Inspect candidate patch
                </Artifact>
              ) : null}
            </>
          ) : (
            <p>No candidate repair was evaluated.</p>
          )}
        </div>
      </div>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The complete record</p>
            <h2>Every variant stays visible.</h2>
          </div>
          <Link to={runPath(run.runId, "checks")} className="text-link">
            Checks &amp; history
          </Link>
        </div>
        <div className="variant-list">
          {run.variants.map((v) => (
            <div key={v.id}>
              <VariantDetail variant={v} />
              {["development", "held-out", "decoy"].includes(v.kind) ? (
                <Link
                  to={runPath(run.runId, `decoys/${encodeURIComponent(v.id)}`)}
                  className="variant-more"
                >
                  Inspect challenge detail
                </Link>
              ) : null}
            </div>
          ))}
        </div>
        {!run.variants.length ? (
          <p className="empty-state">
            No execution variants recorded. Review the source report and
            observations.
          </p>
        ) : null}
      </section>
      <section className="section-block">
        <h2>Artifacts &amp; usage</h2>
        <div className="artifact-list">
          {run.files.map((link) => (
            <Artifact key={link.url} link={link} />
          ))}
        </div>
        <Data title="Model usage record" value={run.modelUsage} />
      </section>
    </>
  );
}
