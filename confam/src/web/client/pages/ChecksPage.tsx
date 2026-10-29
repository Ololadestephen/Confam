import { VariantDetail } from "../evidence.js";
import { record } from "../format.js";
import { Data, Icon, PageTitle, Scope } from "../shared.js";
import type { RunView } from "../types.js";

export function Checks({ run }: { run: RunView }) {
  const versionRecord = record(run.versions);
  const versions = Array.isArray(run.versions)
    ? run.versions
    : Array.isArray(versionRecord?.versions)
      ? versionRecord.versions
      : [];
  return (
    <>
      <PageTitle title="Checks">
        Inspect recorded versions and control results. Missing history is shown
        as missing.
      </PageTitle>
      <section className="panel seal-panel">
        <Icon name="layers" size={32} />
        <div>
          <h2>Recorded checks identity</h2>
          {run.freezeHash ? (
            <code className="hash-value">{run.freezeHash}</code>
          ) : (
            <p>No checks hash included in this view.</p>
          )}
          <p className="muted">
            A displayed hash identifies recorded metadata. Opening this page
            does not rerun integrity verification.
          </p>
        </div>
      </section>
      <div className="version-rail">
        {versions.length ? (
          versions.map((value, index) => {
            const item = record(value);
            return (
              <article className="panel" key={index}>
                <span className="step-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>
                  {typeof item?.id === "string"
                    ? item.id
                    : `Recorded version ${index + 1}`}
                </h3>
                <Data title="Version metadata" value={value} />
              </article>
            );
          })
        ) : (
          <p className="notice">
            No version history was included. A single recorded workflow is not
            evidence of a strengthening round.
          </p>
        )}
      </div>
      <section className="section-block">
        <h2>Supplied controls</h2>
        <div className="variant-list">
          {run.variants
            .filter((v) => v.kind === "control")
            .map((v) => (
              <VariantDetail key={v.id} variant={v} />
            ))}
        </div>
        {!run.variants.some((v) => v.kind === "control") ? (
          <p className="notice">
            No controls were supplied. False-rejection calibration is
            unavailable.
          </p>
        ) : null}
      </section>
      <Data title="Full recorded history" value={run.versions} />
      {run.independent.evaluated ? (
        <Data
          title="Independent per-arm counts"
          value={{ counts: run.independent.counts, arms: run.independent.arms }}
        />
      ) : null}
      <Scope run={run} />
    </>
  );
}
