export interface Route {
  page: string;
  runId?: string;
  variantId?: string;
  jobId?: string;
  folderId?: string;
}
export function routeFor(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "jobs" && parts.length === 2)
    return { page: "job", jobId: parts[1] === "new" ? undefined : parts[1] };
  if (!parts.length) return { page: "home" };
  if (parts[0] === "projects" && parts.length === 1)
    return { page: "projects" };
  if (parts[0] === "guide" && parts.length === 1) return { page: "guide" };
  if (parts[0] === "gaps" && parts.length === 1) return { page: "gaps" };
  if (parts[0] === "gaps" && parts.length === 2)
    return { page: "gap", folderId: parts[1] };
  if (parts[0] === "repairs" && parts.length === 2)
    return { page: "repair", folderId: parts[1] };
  if (parts[0] === "share" && parts.length === 2)
    return { page: "share", runId: parts[1] };
  if (parts[0] !== "runs") return { page: "missing" };
  if (parts.length === 1) return { page: "runs" };
  if (parts[1] === "new" && parts.length === 2) return { page: "new" };
  if (parts.length === 2) return { page: "verdict", runId: parts[1] };
  if (parts.length === 4 && parts[2] === "decoys")
    return { page: "decoy", runId: parts[1], variantId: parts[3] };
  if (
    parts.length === 3 &&
    ["expectations", "live", "compare", "checks"].includes(parts[2]!)
  )
    return { page: parts[2]!, runId: parts[1] };
  return { page: "missing" };
}
export function pageUrl(pathname: string): string {
  const url = new URL(pathname, window.location.origin);
  const token = new URLSearchParams(window.location.search).get("token");
  if (token) url.searchParams.set("token", token);
  return url.pathname + url.search + url.hash;
}
export function runPath(id: string, page = "") {
  return `/runs/${encodeURIComponent(id)}${page ? "/" + page : ""}`;
}
