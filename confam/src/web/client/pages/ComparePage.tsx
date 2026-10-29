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
      <PageTitle title="Compare"></PageTitle>
      <div className="comparison-toolbar">
        <span className="pill">Independent playback</span>
      </div>
      <div className="comparison-grid">
        <EvidencePane
          alignControls
          showAssertions
          title="Original"
          variant={run.variants.find((v) => v.kind === "original")}
        />
        <EvidencePane
          alignControls
          showAssertions
          title="Challenge or control"
          variant={middle}
          alternatives={alternatives}
          onSelect={setMiddleId}
        />
        <EvidencePane
          alignControls
          showAssertions
          title="Candidate"
          variant={run.variants.find((v) => v.kind === "candidate")}
        />
      </div>
      <Scope run={run} />
    </>
  );
}
