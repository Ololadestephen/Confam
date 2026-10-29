import { useState } from "react";
import { AssertionList, EvidencePane, ProbeList } from "../evidence.js";
import { duration, record, statusText } from "../format.js";
import { PageTitle } from "../shared.js";
import type { RunView } from "../types.js";

export function Activity({
  run,
  connected,
}: {
  run: RunView;
  connected: boolean;
}) {
  const [selected, setSelected] = useState("");
  const variant =
    run.variants.find((v) => v.id === selected) ?? run.variants.at(-1);
  return (
    <>
      <PageTitle title="Activity" />
      <div className="activity-toolbar">
        <span className="pill">
          <span className={`tiny-dot ${connected ? "" : "offline"}`} />
          {run.status === "running"
            ? connected
              ? "Following"
              : "Disconnected"
            : "Saved"}
        </span>
        <span>{statusText(run.status)}</span>
        <label>
          Variant{" "}
          <select
            value={variant?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {run.variants.map((v) => (
              <option key={v.id}>{v.id}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="activity-grid">
        <EvidencePane title="Recorded footage" variant={variant} />
        <section className="panel">
          <h2>Steps</h2>
          {variant?.steps.length ? (
            <ol className="activity-timeline">
              {variant.steps.map((step, index) => {
                const item = record(step);
                return (
                  <li key={index}>
                    <span className="timeline-dot" />
                    <div>
                      <code>
                        {typeof item?.name === "string"
                          ? item.name
                          : `Step ${index + 1}`}
                      </code>
                      <span>
                        {duration(
                          typeof item?.elapsedMs === "number"
                            ? item.elapsedMs
                            : undefined,
                        )}{" "}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="muted">No recorded steps.</p>
          )}
        </section>
      </div>
      {variant ? (
        <div className="two-columns section-block">
          <div className="panel">
            <h3>Assertions</h3>
            <AssertionList assertions={variant.assertions} />
          </div>
          <div className="panel">
            <h3>Independent observations</h3>
            <ProbeList probes={variant.probes} />
          </div>
        </div>
      ) : null}
    </>
  );
}
