import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { Activity } from "./ActivityPage.js";
import { Decoy } from "./DecoyPage.js";
import { Overview } from "./OverviewPage.js";
import { Summary, plainHeadline } from "./SummaryPage.js";
import type { RunView } from "../types.js";
const run: RunView = {
  runId: "verify-example",
  project: "different-project",
  caseId: "different-case",
  status: "blocked",
  verdict: "The reported behavior was not reproduced; no candidate verdict.",
  fixture: true,
  expectations: [],
  limitations: ["Only these conditions were evaluated."],
  independent: {
    evaluated: false,
    label: "Independent evaluation not performed.",
  },
  variants: [],
  files: [],
};
afterEach(() => vi.unstubAllGlobals());
function localWindow() {
  vi.stubGlobal("window", {
    location: { origin: "http://127.0.0.1:1234", search: "?token=test" },
  });
}
it("keeps inconclusive verdicts and unavailable calibration explicit without inventing a candidate", () => {
  localWindow();
  const html = renderToStaticMarkup(createElement(Overview, { run }));
  expect(html).toContain(
    "The reported behavior was not reproduced; no candidate verdict.",
  );
  expect(html).toContain("No candidate repair was evaluated.");
  expect(html).toContain("False-rejection calibration unavailable");
  expect(html).toContain("Independent evaluation not performed.");
  expect(html).not.toContain("passed-checks-and-probes");
});
it("labels completed activity as saved evidence rather than simulating execution", () => {
  localWindow();
  const html = renderToStaticMarkup(
    createElement(Activity, {
      run: { ...run, status: "completed" },
      connected: true,
    }),
  );
  expect(html).toContain("This is saved execution evidence, not a live rerun.");
  expect(html).toContain("No steps were supplied. No progress is simulated.");
});
it("displays a qualified surviving challenge without relabeling it caught", () => {
  localWindow();
  const variant = {
    id: "decoy-one",
    kind: "development",
    outcome: "survived",
    assertions: [],
    probes: {},
    steps: [],
    videos: [],
    traces: [],
  };
  const html = renderToStaticMarkup(
    createElement(Decoy, {
      run: { ...run, variants: [variant] },
      id: "decoy-one",
    }),
  );
  expect(html).toContain("A qualified fault may be caught or survive.");
  expect(html).toContain("survived");
  expect(html).toContain(
    "No independent observations recorded for this variant.",
  );
});

it("leads the client summary with the candidate's actual result and keeps development counts labelled", () => {
  localWindow();
  const candidate = (outcome: string) => ({ id: "candidate", kind: "candidate", outcome, assertions: [], probes: {}, steps: [], videos: [], traces: [] });
  expect(plainHeadline({ ...run, status: "completed", variants: [candidate("passed-checks-and-probes")] })).toBe("The proposed fix passed every check listed below.");
  expect(plainHeadline({ ...run, status: "completed", variants: [candidate("assertion-failed")] })).toBe("The proposed fix did not pass the checks listed below.");
  expect(plainHeadline(run)).toBe(run.verdict);
  expect(plainHeadline({ ...run, status: "error", variants: [candidate("passed-checks-and-probes")] })).toBe(run.verdict);
  expect(plainHeadline({ ...run, status: "completed", variants: [candidate("failed-probes")] })).toContain("independent probes contradicted it");
  const html = renderToStaticMarkup(createElement(Summary, {
    run: { ...run, status: "completed", variants: [candidate("passed-checks-and-probes")], development: { total: 6, caught: 5, survived: 0, uncounted: 1 } },
  }));
  expect(html).toContain("The proposed fix passed every check listed below.");
  expect(html).toContain(run.verdict);
  expect(html).toContain("development results");
});
