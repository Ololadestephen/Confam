import type { RunView } from "./types.js";

// The hosted evidence site is built with VITE_CONFAM_STATIC=1. It has no server: every read comes from files written
// by `confam export-site`, and nothing that needs a local Confam (running, deciding, preparing apps) is offered.
export const STATIC_SITE =
  (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_CONFAM_STATIC === "1";
export const REPOSITORY_URL = "https://github.com/Ololadestephen/Confam";

export function staticDataPath(pathname: string, runId?: string): string {
  const name = (value: string) => encodeURIComponent(value);
  if (pathname === "/api/runs") return "/data/runs.json";
  if (pathname === "/api/run" && runId) return `/data/run/${name(runId)}.json`;
  if (pathname === "/api/gaps") return "/data/gaps.json";
  if (pathname === "/api/repairs") return "/data/repairs.json";
  const item = /^\/api\/(gaps|repairs)\/([^/]+)$/.exec(pathname);
  if (item) return `/data/${item[1]}/${name(decodeURIComponent(item[2]!))}.json`;
  return "/data/unavailable.json";
}

export function apiUrl(path: string, runId?: string): string {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin)
    throw new Error("Unsupported review URL.");
  if (STATIC_SITE) return staticDataPath(url.pathname, runId);
  const token = new URLSearchParams(window.location.search).get("token");
  if (token) url.searchParams.set("token", token);
  if (runId) url.searchParams.set("run", runId);
  return url.pathname + url.search;
}
export function artifactUrl(value: string): string | undefined {
  try {
    const url = new URL(value, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      !["http:", "https:"].includes(url.protocol)
    )
      return undefined;
    if (STATIC_SITE)
      return url.pathname.startsWith("/data/") ? url.pathname : undefined;
    return apiUrl(url.pathname + url.search);
  } catch {
    return undefined;
  }
}
export function readRun(value: unknown): RunView {
  if (!value || typeof value !== "object")
    throw new Error("The review server returned an invalid report.");
  const run = value as Partial<RunView>;
  if (
    typeof run.runId !== "string" ||
    typeof run.project !== "string" ||
    typeof run.caseId !== "string" ||
    typeof run.status !== "string" ||
    typeof run.verdict !== "string" ||
    !Array.isArray(run.variants) ||
    !Array.isArray(run.expectations) ||
    !Array.isArray(run.limitations) ||
    !run.independent
  ) {
    throw new Error("The review server returned an incomplete report.");
  }
  return run as RunView;
}
