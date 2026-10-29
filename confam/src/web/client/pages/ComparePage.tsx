import { useState } from "react";
import { EvidencePane } from "../evidence.js";
import { PageTitle, Scope } from "../shared.js";
import type { RunView } from "../types.js";

export function Compare({ run }: { run: RunView }) {
  const alternatives = run.variants.filter(
    (v) => !["original", "candidate"].includes(v.kind),
  );
  const [middleId, setMiddleId] = useState("");
  const middle =
    alternatives.find((v) => v.id === middleId) ??
    alternatives.find((v) =>
      ["development", "decoy", "held-out"].includes(v.kind),
    ) ??
    alternatives[0];
  return (
    <>
      <PageTitle title="Compare">
        Inspect the original, a challenge or control, and the candidate. Each
        recording uses its own clock.
      </PageTitle>
      <div className="comparison-grid">
        <EvidencePane
          alignControls
          title="Original"
          variant={run.variants.find((v) => v.kind === "original")}
        />
        <EvidencePane
          alignControls
          title="Challenge or control"
          variant={middle}
          alternatives={alternatives}
          onSelect={setMiddleId}
        />
        <EvidencePane
          alignControls
          title="Candidate"
          variant={run.variants.find((v) => v.kind === "candidate")}
        />
      </div>
      <p className="notice">
        Playback is deliberately independent. Workflow timestamps and video
        timestamps are not assumed to align. HTTP-only workflows may have blank
        browser footage; use their actual assertions and traces.
      </p>
      <Scope run={run} />
    </>
  );
}
