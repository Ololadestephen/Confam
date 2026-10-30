import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { startReviewServer } from "./server.js";
import { RunView } from "./view.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action();
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "confam-review-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "evidence"));
  await writeFile(path.join(root, "evidence", "video.webm"), "0123456789");
  await writeFile(path.join(root, "unlisted.log"), "private unlisted");
  await writeFile(path.join(root, "candidate.patch"), "unlisted patch");
  const report = {
    project: "Different project",
    caseId: "state-loss",
    status: "completed",
    verdict: "Checks passed under these conditions.",
    confirmation: "fixture",
    limitations: ["Chromium only"],
    variants: [
      {
        id: "original",
        kind: "original",
        result: {
          status: "assertion-failed",
          videos: ["evidence/video.webm"],
          assertions: [
            {
              expectationId: "R1",
              passed: false,
              actual: "a@example.com",
              password: "private",
            },
          ],
          steps: [{ name: "reload", elapsedMs: 90 }],
        },
      },
    ],
  };
  await writeFile(path.join(root, "verification.json"), JSON.stringify(report));
  const server = await startReviewServer(root);
  cleanup.push(() => server.close());
  const endpoint = (route: string) =>
    new URL(route + "?token=" + server.token, server.url).href;
  return { root, server, endpoint, report };
}
describe("local evidence review boundaries", () => {
  it("reads completed comparisons from the run's own evaluations folder and skips links and unfinished ones", async () => {
    const { root } = await fixture();
    const arm = (role: string, caught: number, falseRejections: number) => ({
      role, provenance: `${role} arm`, counts: { total: 6, caught, survived: 6 - caught, uncounted: 0 },
      falseRejections, controls: [{}, {}],
    });
    await mkdir(path.join(root, "evaluations", "fixture-a"), { recursive: true });
    await writeFile(path.join(root, "evaluations", "fixture-a", "comparison.json"), JSON.stringify({
      status: "completed", purpose: "integration-fixture", arms: [arm("existing", 0, 0), arm("direct-ai", 2, 2)],
    }));
    await mkdir(path.join(root, "evaluations", "fixture-running"));
    await writeFile(path.join(root, "evaluations", "fixture-running", "comparison.json"), JSON.stringify({ status: "running", arms: [] }));
    const outside = await mkdtemp(path.join(os.tmpdir(), "confam-outside-"));
    cleanup.push(() => rm(outside, { recursive: true, force: true }));
    await writeFile(path.join(outside, "comparison.json"), JSON.stringify({ status: "completed", purpose: "held-out", arms: [arm("confam-final", 6, 0)] }));
    await symlink(outside, path.join(root, "evaluations", "linked"));
    const view = await new RunView(root, "test").read();
    expect(view.comparisons).toEqual([{
      purpose: "integration-fixture",
      arms: [
        { role: "existing", provenance: "existing arm", counts: { total: 6, caught: 0, survived: 6, uncounted: 0 }, falseRejections: 0, controlErrors: 0, controls: 2, provenanceVerified: false },
        { role: "direct-ai", provenance: "direct-ai arm", counts: { total: 6, caught: 2, survived: 4, uncounted: 0 }, falseRejections: 2, controlErrors: 0, controls: 2, provenanceVerified: false },
      ],
    }]);
    expect(view.files.map(({ label }) => label)).toContain("Known-fault comparison");
  });
  it("preserves evaluated counts, recording fallback reasons and absence of observations", async () => {
    const { root, report } = await fixture();
    await writeFile(
      path.join(root, "verification.json"),
      JSON.stringify({
        ...report,
        independentEvaluation: {
          evaluated: true,
          complete: false,
          counts: [
            {
              role: "confam",
              counts: { caught: 1, survived: 2 },
              falseRejections: 1,
            },
          ],
        },
      }),
    );
    const current = await new RunView(root, "test").read();
    expect(current.independent.counts).toEqual([
      {
        role: "confam",
        counts: { caught: 1, survived: 2 },
        falseRejections: 1,
      },
    ]);
    expect(current.observations).toBeUndefined();
    await writeFile(
      path.join(root, "verification.json"),
      JSON.stringify({
        ...report,
        heldOut: {
          evaluated: true,
          total: 3,
          caught: 1,
          survived: 2,
          uncounted: 0,
        },
      }),
    );
    expect(
      (await new RunView(root, "test").read()).independent.counts,
    ).toMatchObject({ total: 3, caught: 1, survived: 2 });
    await rm(path.join(root, "verification.json"));
    await writeFile(
      path.join(root, "recording-intake.json"),
      JSON.stringify({
        status: "text-fallback",
        reason: "Unsupported media; continue with text",
        limitations: [],
      }),
    );
    expect((await new RunView(root, "test").read()).limitations).toContain(
      "Unsupported media; continue with text",
    );
  });
  it("serves only declared confined artifacts and supports video ranges", async () => {
    const { root, endpoint, server } = await fixture();
    const response = await fetch(endpoint("/api/run"));
    const view = await response.json();
    expect(view.project).toBe("Different project");
    expect(view.fixture).toBe(true);
    expect(
      view.files.some((file: { label: string }) =>
        /patch|unlisted/.test(file.label),
      ),
    ).toBe(false);
    const video = new URL(view.variants[0].videos[0].url, server.url);
    const range = await fetch(video, { headers: { Range: "bytes=2-5" } });
    expect(range.status).toBe(206);
    expect(range.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await range.text()).toBe("2345");
    expect(
      (await fetch(video, { headers: { Range: "bytes=99-100" } })).status,
    ).toBe(416);
    expect(
      (await fetch(endpoint("/api/artifacts/" + "0".repeat(64)))).status,
    ).toBe(404);
    expect((await fetch(new URL("/api/run", server.url))).status).toBe(403);
    expect((await fetch(endpoint("/api/run"), { method: "POST" })).status).toBe(
      405,
    );
    expect(
      (
        await fetch(endpoint("/api/run"), {
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
    ).toBe(403);
    await symlink(
      path.join(root, "unlisted.log"),
      path.join(root, "evidence", "link.log"),
    );
    const model = new RunView(root, "test");
    expect(await model.artifacts.add("evidence/link.log")).toBeUndefined();
    expect(await model.artifacts.add("../outside.log")).toBeUndefined();
    expect(
      (await fetch(endpoint("/api/artifacts/%2e%2e%2funlisted.log"))).status,
    ).toBe(404);
  });
  it("exports a deliberate redacted summary without artifact links or source", async () => {
    const { endpoint } = await fixture();
    const exported = await (await fetch(endpoint("/api/export"))).json();
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain("a@example.com");
    expect(serialized).not.toContain('"private"');
    expect(serialized).not.toContain("/api/artifacts");
    expect(serialized).not.toContain("video.webm");
    expect(exported.variants[0].assertions[0].password).toBe("[redacted]");
    expect(exported.variants[0].assertions[0].actual).toBe("[redacted email]");
  });
  it("keeps the SSE connection open and delivers a saved metadata change", async () => {
    const { root, endpoint, report } = await fixture();
    const abort = new AbortController();
    const response = await fetch(endpoint("/api/events"), {
      signal: abort.signal,
    });
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      "event: run",
    );
    await writeFile(
      path.join(root, "verification.json"),
      JSON.stringify({ ...report, verdict: "Updated evidence" }),
    );
    let received = "";
    const timer = setTimeout(() => abort.abort(), 4000);
    try {
      while (!received.includes("Updated evidence"))
        received += new TextDecoder().decode((await reader.read()).value);
    } finally {
      clearTimeout(timer);
      abort.abort();
    }
    expect(received).toContain("Updated evidence");
  });
});

describe("run collection", () => {
  it("lists recognized regular runs and isolates their evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "confam-catalog-"));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const assets = path.join(root, "assets");
    await mkdir(assets);
    await writeFile(path.join(assets, "index.html"), "review app");
    for (const [id, content] of [
      ["verify-one", "one"],
      ["challenge-two", "two"],
    ]) {
      const run = path.join(root, id!);
      await mkdir(run);
      await mkdir(path.join(run, "evidence"));
      await writeFile(path.join(run, "evidence", "video.webm"), content!);
      await writeFile(
        path.join(run, "verification.json"),
        JSON.stringify({
          project: id,
          variants: [
            { id: "original", result: { videos: ["evidence/video.webm"] } },
          ],
        }),
      );
    }
    await symlink(
      path.join(root, "verify-one"),
      path.join(root, "verify-linked"),
    );
    await mkdir(path.join(root, "verify-bad"));
    await symlink(
      path.join(root, "verify-one", "verification.json"),
      path.join(root, "verify-bad", "verification.json"),
    );
    const server = await startReviewServer(root, { assetRoot: assets });
    cleanup.push(() => server.close());
    const api = (route: string, id?: string) =>
      `${server.url.split("?")[0]}api/${route}?token=${server.token}${id ? `&run=${id}` : ""}`;
    const listing = await (await fetch(api("runs"))).json();
    expect(
      listing.runs.map((run: { runId: string }) => run.runId).sort(),
    ).toEqual(["challenge-two", "verify-one"]);
    expect((await fetch(api("run"))).status).toBe(404);
    expect((await fetch(api("run", "verify-linked"))).status).toBe(404);
    expect((await fetch(api("run", "verify-missing"))).status).toBe(404);
    const first = await (await fetch(api("run", "verify-one"))).json();
    expect(first.variants[0].videos[0].url).toContain("run=verify-one");
    expect(
      await (
        await fetch(new URL(first.variants[0].videos[0].url, server.url))
      ).text(),
    ).toBe("one");
    const other = new URL(first.variants[0].videos[0].url, server.url);
    other.searchParams.set("run", "challenge-two");
    expect((await fetch(other)).status).toBe(404);
    for (const route of [
      "/runs",
      "/runs/new",
      "/runs/verify-one",
      "/runs/verify-one/live",
      "/runs/verify-one/decoys/example",
      "/share/example",
      "/guide",
    ]) {
      expect(await (await fetch(new URL(route, server.url))).text()).toBe(
        "review app",
      );
    }
    expect((await fetch(new URL("/unknown", server.url))).status).toBe(404);
  });
});
