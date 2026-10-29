import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { startReviewServer } from "./server.js";
import { RunView } from "./view.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "confam-review-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "evidence"));
  await writeFile(path.join(root, "evidence", "video.webm"), "0123456789");
  await writeFile(path.join(root, "unlisted.log"), "private unlisted");
  await writeFile(path.join(root, "candidate.patch"), "unlisted patch");
  const report = { project: "Different project", caseId: "state-loss", status: "completed", verdict: "Checks passed under these conditions.", confirmation: "fixture",
    limitations: ["Chromium only"], variants: [{ id: "original", kind: "original", result: { status: "assertion-failed", videos: ["evidence/video.webm"], assertions: [{ expectationId: "R1", passed: false, actual: "a@example.com", password: "private" }], steps: [{ name: "reload", elapsedMs: 90 }] } }] };
  await writeFile(path.join(root, "verification.json"), JSON.stringify(report));
  const server = await startReviewServer(root);
  cleanup.push(() => server.close());
  const endpoint = (route: string) => new URL(route + "?token=" + server.token, server.url).href;
  return { root, server, endpoint, report };
}
describe("local evidence review boundaries", () => {
  it("preserves evaluated counts, recording fallback reasons and absence of observations", async () => {
    const { root, report } = await fixture();
    await writeFile(path.join(root, "verification.json"), JSON.stringify({ ...report, independentEvaluation: { evaluated: true, complete: false, counts: [{ role: "confam", counts: { caught: 1, survived: 2 }, falseRejections: 1 }] } }));
    const current = await new RunView(root, "test").read();
    expect(current.independent.counts).toEqual([{ role: "confam", counts: { caught: 1, survived: 2 }, falseRejections: 1 }]);
    expect(current.observations).toBeUndefined();
    await writeFile(path.join(root, "verification.json"), JSON.stringify({ ...report, heldOut: { evaluated: true, total: 3, caught: 1, survived: 2, uncounted: 0 } }));
    expect((await new RunView(root, "test").read()).independent.counts).toMatchObject({ total: 3, caught: 1, survived: 2 });
    await rm(path.join(root, "verification.json"));
    await writeFile(path.join(root, "recording-intake.json"), JSON.stringify({ status: "text-fallback", reason: "Unsupported media; continue with text", limitations: [] }));
    expect((await new RunView(root, "test").read()).limitations).toContain("Unsupported media; continue with text");
  });
  it("serves only declared confined artifacts and supports video ranges", async () => {
    const { root, endpoint, server } = await fixture();
    const response = await fetch(endpoint("/api/run")); const view = await response.json();
    expect(view.project).toBe("Different project"); expect(view.fixture).toBe(true);
    expect(view.files.some((file: { label: string }) => /patch|unlisted/.test(file.label))).toBe(false);
    const video = new URL(view.variants[0].videos[0].url, server.url);
    const range = await fetch(video, { headers: { Range: "bytes=2-5" } });
    expect(range.status).toBe(206); expect(range.headers.get("content-range")).toBe("bytes 2-5/10"); expect(await range.text()).toBe("2345");
    expect((await fetch(video, { headers: { Range: "bytes=99-100" } })).status).toBe(416);
    expect((await fetch(endpoint("/api/artifacts/" + "0".repeat(64)))).status).toBe(404);
    expect((await fetch(new URL("/api/run", server.url))).status).toBe(403);
    expect((await fetch(endpoint("/api/run"), { method: "POST" })).status).toBe(405);
    expect((await fetch(endpoint("/api/run"), { headers: { Origin: "https://untrusted.example" } })).status).toBe(403);
    await symlink(path.join(root, "unlisted.log"), path.join(root, "evidence", "link.log"));
    const model = new RunView(root, "test");
    expect(await model.artifacts.add("evidence/link.log")).toBeUndefined();
    expect(await model.artifacts.add("../outside.log")).toBeUndefined();
    expect((await fetch(endpoint("/api/artifacts/%2e%2e%2funlisted.log"))).status).toBe(404);
  });
  it("exports a deliberate redacted summary without artifact links or source", async () => {
    const { endpoint } = await fixture();
    const exported = await (await fetch(endpoint("/api/export"))).json();
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain("a@example.com"); expect(serialized).not.toContain('"private"');
    expect(serialized).not.toContain("/api/artifacts"); expect(serialized).not.toContain("video.webm");
    expect(exported.variants[0].assertions[0].password).toBe("[redacted]");
    expect(exported.variants[0].assertions[0].actual).toBe("[redacted email]");
  });
  it("keeps the SSE connection open and delivers a saved metadata change", async () => {
    const { root, endpoint, report } = await fixture();
    const abort = new AbortController();
    const response = await fetch(endpoint("/api/events"), { signal: abort.signal });
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: run");
    await writeFile(path.join(root, "verification.json"), JSON.stringify({ ...report, verdict: "Updated evidence" }));
    let received = "";
    const timer = setTimeout(() => abort.abort(), 4000);
    try { while (!received.includes("Updated evidence")) received += new TextDecoder().decode((await reader.read()).value); }
    finally { clearTimeout(timer); abort.abort(); }
    expect(received).toContain("Updated evidence");
  });
});
