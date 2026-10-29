import { useEffect, useState } from "react";
import type { ExecutionJob } from "../../jobs/contracts.js";
import { apiUrl } from "./api.js";
import { pageUrl } from "./routing.js";

async function request(
  query: string,
  body?: unknown,
): Promise<{ job?: ExecutionJob; jobs?: ExecutionJob[] }> {
  const response = await fetch(
    apiUrl(`/api/jobs${query}`),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error ?? "Could not load the execution job.");
  return value;
}
const active = (job?: ExecutionJob) =>
  job?.status === "ready" ||
  job?.status === "running" ||
  job?.status === "cancelling";
export function useExecutionJob(draftId?: string, jobId?: string) {
  const [job, setJob] = useState<ExecutionJob>();
  const [jobs, setJobs] = useState<ExecutionJob[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    const query = jobId
      ? `?id=${encodeURIComponent(jobId)}`
      : draftId
        ? `?draft=${encodeURIComponent(draftId)}`
        : "";
    if (!query) {
      setError("A confirmed draft is required.");
      return;
    }
    void request(query)
      .then((value) => {
        if (mounted) {
          setJob(value.job);
          setJobs(value.jobs ?? []);
        }
      })
      .catch((cause) => {
        if (mounted) setError((cause as Error).message);
      });
    return () => {
      mounted = false;
    };
  }, [draftId, jobId]);
  useEffect(() => {
    if (!active(job)) return;
    let mounted = true;
    const timer = window.setInterval(() => {
      void request(`?id=${encodeURIComponent(job!.id)}`)
        .then((value) => {
          if (mounted && value.job) {
            setJob(value.job);
            setError("");
          }
        })
        .catch((cause) => {
          if (mounted) setError((cause as Error).message);
        });
    }, 700);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [job?.id, job?.status]);
  async function mutate(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const value = await request("", body);
      if (!value.job) throw new Error("The server returned no execution job.");
      setJob(value.job);
      if (!jobId)
        window.history.replaceState(
          null,
          "",
          pageUrl(`/jobs/${encodeURIComponent(value.job.id)}`),
        );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { job, jobs, error, busy, mutate };
}
