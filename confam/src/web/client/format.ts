export function pretty(value: unknown): string {
  if (value === undefined) return "Not recorded";
  try { return JSON.stringify(value, null, 2); }
  catch { return "Observation could not be displayed."; }
}
export function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function duration(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "Not recorded";
  const seconds = Math.max(0, Math.floor(value / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function statusText(value: string): string {
  return value.replace(/[-_]/g, " ");
}
export function statusTone(value: string, kind?: string): string {
  if (kind === "original" && ["assertion-failed", "bug-reproduced"].includes(value)) return "breaks";
  if (["caught", "passed", "passed-checks-and-probes", "bug-reproduced"].includes(value)) return "holds";
  if (["survived", "failed-checks", "failed-probes", "falsely-rejected", "assertion-failed"].includes(value)) return "breaks";
  if (["needs-review", "awaiting-confirmation"].includes(value)) return "review";
  return "muted";
}
