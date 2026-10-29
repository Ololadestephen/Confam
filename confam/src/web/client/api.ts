import type { RunView } from "./types.js";

export function apiUrl(path: string): string {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error("Unsupported review URL.");
  const token = new URLSearchParams(window.location.search).get("token");
  if (token) url.searchParams.set("token", token);
  return url.pathname + url.search;
}
export function artifactUrl(value: string): string | undefined {
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !["http:", "https:"].includes(url.protocol)) return undefined;
    return apiUrl(url.pathname + url.search);
  } catch { return undefined; }
}
export function readRun(value: unknown): RunView {
  if (!value || typeof value !== "object") throw new Error("The review server returned an invalid report.");
  const run = value as Partial<RunView>;
  if (typeof run.runId !== "string" || typeof run.project !== "string" || typeof run.caseId !== "string"
    || typeof run.status !== "string" || typeof run.verdict !== "string" || !Array.isArray(run.variants)
    || !Array.isArray(run.expectations) || !Array.isArray(run.limitations) || !run.independent) {
    throw new Error("The review server returned an incomplete report.");
  }
  return run as RunView;
}
