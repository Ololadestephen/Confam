import type { RunView } from "../types.js";
import { RunNav } from "../shared.js";
import { Overview } from "./OverviewPage.js";
import { Expectations } from "./ExpectationsPage.js";
import { Compare } from "./ComparePage.js";
import { Activity } from "./ActivityPage.js";
import { Checks } from "./ChecksPage.js";
import { Decoy } from "./DecoyPage.js";
import { Summary } from "./SummaryPage.js";

export function RunLayout({
  run,
  page,
  connected,
  variantId,
}: {
  run: RunView;
  page: string;
  connected: boolean;
  variantId?: string;
}) {
  return (
    <main id="main" className={`workspace run-workspace page-${page}`}>
      <RunNav run={run} active={page} />
      {page === "expectations" ? (
        <Expectations run={run} />
      ) : page === "compare" ? (
        <Compare run={run} />
      ) : page === "live" ? (
        <Activity run={run} connected={connected} />
      ) : page === "checks" ? (
        <Checks run={run} />
      ) : page === "decoy" ? (
        <Decoy run={run} id={variantId ?? ""} />
      ) : page === "share" ? (
        <Summary run={run} />
      ) : (
        <Overview run={run} />
      )}
    </main>
  );
}
