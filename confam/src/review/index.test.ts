import { describe, expect, it } from "vitest";
import { renderReview, reviewProject } from "./index.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const base = { status: "completed", project: "app", caseId: "case", variants: [{ kind: "original", result: { status: "assertion-failed" } }], limitations: [] };
describe("review reporting", () => {
  it("classifies only completed candidate observations as pass or failure", () => {
    expect(renderReview({ ...base, candidate: "passed" }, "/tmp/report.json", false).exitCode).toBe(0);
    expect(renderReview({ ...base, candidate: "failed" }, "/tmp/report.json", false).exitCode).toBe(1);
    expect(renderReview({ ...base, status: "cancelled", candidate: "failed" }, undefined, false).exitCode).toBe(2);
    expect(renderReview({ ...base, status: "blocked" }, undefined, false).exitCode).toBe(2);
    expect(renderReview({ ...base, candidate: { outcome: "incomplete" } }, undefined, true).exitCode).toBe(2);
    expect(renderReview({ ...base, candidate: { outcome: "failed-probes" } }, undefined, true).exitCode).toBe(1);
    expect(renderReview({ ...base, cleanupComplete: false, candidate: "passed" }, undefined, false).exitCode).toBe(2);
  });
  it("escapes untrusted text and distinguishes development from independent evidence", () => {
    const result = renderReview({ ...base, project: "a\n# forged", candidate: { outcome: "passed-checks-and-probes" }, development: { caught: 1, survived: 2, uncounted: 3, total: 6 }, limitations: ["[unsafe](link)"] }, "/tmp/a (b).json", true);
    expect(result.markdown).toContain("a \\# forged");
    expect(result.markdown).toContain("1 caught, 2 survived, 3 uncounted");
    expect(result.markdown).toContain("Independent evaluation: not performed");
    expect(result.markdown).toContain("\\[unsafe\\](link)");
    expect(result.markdown).toContain("a%20%28b%29.json");
  });
  it("writes an incomplete review when input loading fails", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "confam-review-"));
    try {
      const result = await reviewProject({ project: "/missing", caseFile: "/missing", workflow: "/missing", candidate: "/missing", confirmation: "developer-cli", runsDirectory: directory });
      expect(result.exitCode).toBe(2);
      expect(await readFile(result.markdownPath, "utf8")).toContain("incomplete; no candidate verdict");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
