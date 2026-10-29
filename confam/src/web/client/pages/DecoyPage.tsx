import {
  AssertionList,
  Artifact,
  EvidencePane,
  ProbeList,
  Status,
} from "../evidence.js";
import { Link, PageTitle, Scope } from "../shared.js";
import { runPath } from "../routing.js";
import type { RunView } from "../types.js";

export function Decoy({ run, id }: { run: RunView; id: string }) {
  const variant = run.variants.find(
    (v) => v.id === id && ["development", "held-out", "decoy"].includes(v.kind),
  );
  if (!variant)
    return (
      <>
        <PageTitle
          eyebrow="Challenge detail"
          title="This challenge is not in the record."
        />
        <Link to={runPath(run.runId)} className="button button-outline">
          Return to overview ↗
        </Link>
      </>
    );
  return (
    <>
      <PageTitle
        eyebrow={`${variant.kind} / Challenge detail`}
        title={variant.id}
      >
        A qualified fault may be caught or survive. Caught requires failure of
        an assertion mapped to its declared violation.
      </PageTitle>
      <div className="challenge-heading is-decoy">
        <span className="stamp">DECOY</span>
        <Status value={variant.outcome} kind={variant.kind} />
        <p>
          Qualification details are limited to the observations preserved in
          this report. Missing stages are not inferred.
        </p>
      </div>
      <div className="activity-grid">
        <EvidencePane title="Challenge footage" variant={variant} />
        <div className="panel">
          <h2>What the checks observed</h2>
          <AssertionList assertions={variant.assertions} />
          <h3 className="spaced">Independent observations</h3>
          <ProbeList probes={variant.probes} />
          {variant.error ? <p className="error-note">{variant.error}</p> : null}
        </div>
      </div>
      <div className="artifact-list">
        {variant.traces.map((link) => (
          <Artifact key={link.url} link={link} />
        ))}
        {variant.patch ? (
          <Artifact link={variant.patch}>Challenge patch</Artifact>
        ) : null}
      </div>
      <Scope run={run} />
    </>
  );
}
