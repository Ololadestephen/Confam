import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { exportSite } from "./export-site.js";
import { staticDataPath } from "./client/api.js";

const cleanup: string[] = [];
afterEach(async () => { for (const directory of cleanup.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function run(runs: string, id: string, project: string) {
  const directory = path.join(runs, id);
  await mkdir(path.join(directory, "evidence"), { recursive: true });
  await writeFile(path.join(directory, "evidence", "video.webm"), "video bytes");
  await writeFile(path.join(directory, "candidate.patch"), "diff --git a/secret.ts b/secret.ts\n");
  await writeFile(path.join(directory, "verification.json"), JSON.stringify({
    schemaVersion: 1, project, caseId: "case", status: "completed", verdict: "Checks passed.", confirmation: "developer-cli",
    limitations: [`Ran from ${path.join(runs, id)}`],
    variants: [
      { id: "original", kind: "original", result: { status: "assertion-failed", videos: ["evidence/video.webm"], assertions: [], steps: [] } },
      { id: "candidate", kind: "candidate", result: { status: "passed", videos: [], assertions: [], steps: [] } },
    ],
  }));
}

it("publishes evidence only: no private patches or recordings, no local paths, links kept local are unusable", async () => {
  const base = await mkdtemp(path.join(realpathSync(tmpdir()), "confam-site-")); cleanup.push(base);
  const runs = path.join(base, "runs");
  const publicId = "verify-11111111-1111-4111-8111-111111111111";
  const privateId = "verify-22222222-2222-4222-8222-222222222222";
  await run(runs, publicId, "salon");
  await run(runs, privateId, "mosaic-latest");
  const manifest = path.join(base, "evidence.json");
  await writeFile(manifest, JSON.stringify({ schemaVersion: 1, generatedFrom: "test", runs: [publicId, privateId], privateProjects: ["mosaic"] }));
  const out = path.join(base, "site");
  const result = await exportSite({ runsRoot: runs, manifest, out });
  expect(result.runs).toBe(2);

  const listed = JSON.parse(await readFile(path.join(out, "runs.json"), "utf8"));
  expect(listed.runs.map(({ runId }: { runId: string }) => runId)).toEqual([publicId, privateId]);
  const publicFiles = await readdir(path.join(out, "artifacts", publicId));
  expect(publicFiles.some((file) => file.endsWith(".webm"))).toBe(true);
  expect(publicFiles.some((file) => file.endsWith(".patch"))).toBe(true);
  const privateFiles = await readdir(path.join(out, "artifacts", privateId));
  expect(privateFiles.some((file) => file.endsWith(".webm") || file.endsWith(".patch"))).toBe(false);

  const privateRun = await readFile(path.join(out, "run", `${privateId}.json`), "utf8");
  expect(privateRun).toContain("unavailable:recorded-locally");
  expect(privateRun).not.toContain(base);
  expect(privateRun).not.toContain("/api/artifacts/");
  const publicRun = JSON.parse(await readFile(path.join(out, "run", `${publicId}.json`), "utf8"));
  expect(JSON.stringify(publicRun)).toContain(`/data/artifacts/${publicId}/`);
  expect(JSON.parse(await readFile(path.join(out, "site.json"), "utf8")).notice).toContain("Nothing runs on this site");
});

it("maps every read the interface makes to a static file", () => {
  expect(staticDataPath("/api/runs")).toBe("/data/runs.json");
  expect(staticDataPath("/api/run", "verify-1")).toBe("/data/run/verify-1.json");
  expect(staticDataPath("/api/gaps")).toBe("/data/gaps.json");
  expect(staticDataPath("/api/gaps/draft-gaps-1")).toBe("/data/gaps/draft-gaps-1.json");
  expect(staticDataPath("/api/repairs/repair-1")).toBe("/data/repairs/repair-1.json");
  expect(staticDataPath("/api/projects")).toBe("/data/unavailable.json");
  expect(staticDataPath("/api/run")).toBe("/data/unavailable.json");
});
