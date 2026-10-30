import { AssertionList, Artifact, Status, VariantDetail } from "../evidence.js";
import { Data, Icon, Link, Metrics, Scope } from "../shared.js";
import { runPath } from "../routing.js";
import type { ComparisonView, RunView } from "../types.js";

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
      {run.comparisons?.map((comparison, index) => (
        <ComparisonTable key={index} comparison={comparison} />
      ))}
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

const ARM_LABELS: Record<string, string> = {
  existing: "Existing tests",
  "direct-ai": "AI-written tests, used as generated",
  "confam-v1": "Confam initial checks",
  "confam-final": "Confam final checks",
};

const PURPOSE_LABELS: Record<string, { eyebrow: string; note: string }> = {
  "integration-fixture": {
    eyebrow: "Known faults (not held out)",
    note: "These faults were not held out from Confam's development, so this is development evidence, not independent evaluation.",
  },
  "held-out": {
    eyebrow: "Held-out faults",
    note: "Faults kept out of building these checks: the independent comparison.",
  },
};

function ComparisonTable({ comparison }: { comparison: ComparisonView }) {
  const label = PURPOSE_LABELS[comparison.purpose] ?? {
    eyebrow: "Comparison",
    note: `Unrecognised purpose "${comparison.purpose}"; treat these counts as unlabelled.`,
  };
  return (
    <section className="panel section-block comparison-panel">
      <span className="eyebrow">{label.eyebrow}</span>
      <h2>The same faults, every set of checks.</h2>
      <p className="comparison-note">{label.note}</p>
      <div className="comparison-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">Checks</th>
              <th scope="col">Caught</th>
              <th scope="col">Survived</th>
              <th scope="col">Uncounted</th>
              <th scope="col">Correct fixes wrongly rejected</th>
            </tr>
          </thead>
          <tbody>
            {comparison.arms.map((arm) => (
              <tr key={arm.role}>
                <th scope="row">
                  {ARM_LABELS[arm.role] ?? arm.role}
                  {arm.provenance ? (
                    <small>
                      {arm.provenance}
                      {arm.provenanceVerified ? "" : " (provenance unverified)"}
                    </small>
                  ) : null}
                </th>
                <td data-label="Caught">
                  {arm.counts.caught} of {arm.counts.total}
                </td>
                <td data-label="Survived">{arm.counts.survived}</td>
                <td data-label="Uncounted">{arm.counts.uncounted}</td>
                <td
                  data-label="Correct fixes wrongly rejected"
                  className={arm.falseRejections > 0 ? "comparison-bad" : undefined}
                >
                  {arm.controlErrors > 0
                    ? `Calibration incomplete: ${arm.controlErrors} control error${arm.controlErrors === 1 ? "" : "s"}`
                    : `${arm.falseRejections} of ${arm.controls}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="comparison-note">
        A catch only means something if the same checks pass the correct fixes.
      </p>
    </section>
  );
}
