import { useEffect, useState } from "react";
import { apiUrl, readRun } from "./api.js";
import type { RunView } from "./types.js";
export interface RunSummary {
  runId: string;
  project: string;
  caseId: string;
  status: string;
  verdict: string;
  fixture: boolean;
  durationMs?: number;
}
export function useRuns() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch(apiUrl("/api/runs"), { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw Error(
            "The run library could not be read. Open the URL printed by the CLI.",
          );
        const data = await response.json();
        if (!Array.isArray(data.runs))
          throw Error("The run library returned invalid data.");
        setRuns(data.runs);
        setTruncated(data.truncated === true);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(String(cause.message));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, []);
  return { runs, loading, error, truncated };
}
export function useRun(id: string) {
  const [run, setRun] = useState<RunView>();
  const [error, setError] = useState<string>();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    const accept = (value: unknown) => {
      if (active) {
        setRun(readRun(value));
        setError(undefined);
      }
    };
    fetch(apiUrl("/api/run", id), { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw Error("This run is unavailable in the selected local library.");
        accept(await response.json());
      })
      .catch((cause) => {
        if (active && !abort.signal.aborted) setError(cause.message);
      });
    const events = new EventSource(apiUrl("/api/events", id));
    events.onopen = () => {
      if (active) setConnected(true);
    };
    events.onerror = () => {
      if (active) setConnected(false);
    };
    events.addEventListener("unavailable", () => {
      if (active)
        setError(
          "Metadata is being updated. Showing the last readable report.",
        );
    });
    events.addEventListener("run", (event) => {
      try {
        accept(JSON.parse((event as MessageEvent<string>).data));
      } catch {
        if (active)
          setError(
            "An update could not be read. Showing the last saved report.",
          );
      }
    });
    return () => {
      active = false;
      abort.abort();
      events.close();
    };
  }, [id]);
  return { run, error, connected };
}
