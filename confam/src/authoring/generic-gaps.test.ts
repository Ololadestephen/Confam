import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { proposeGaps, type GapOptions } from "./generic-gaps.js";
import type { ModelTransport } from "../models/client.js";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-gaps-")); directories.push(directory);
  const app = path.join(directory, "app"); await mkdir(app);
  await writeFile(path.join(app, "main.js"), "limit by first forwarded address\n");
  await writeFile(path.join(directory, "project.json"), JSON.stringify({
    schemaVersion: 1, id: "sample", root: "app", sourceFiles: ["main.js"], runtime: {
      command: ["node", "main.js"], readinessPath: "/ready", portVariable: "PORT", dataVariable: "STATE", restart: false,
    }
  }));
  await writeFile(path.join(directory, "case.json"), JSON.stringify({
    schemaVersion: 1, id: "example", projectId: "sample", report: "report.md", fixtures: {},
    expectations: [{ id: "limited", statement: "A sixth request is refused", provenance: "developer" }], reproductionTargets: ["limited"],
    mode: "verification", controls: [],
  }));
  await writeFile(path.join(directory, "report.md"), "Spam gets through.");
  return directory;
}
function transport(inspect: () => void = () => undefined): ModelTransport {
  return {
    mode: "fixture", count: async () => 100, generate: async () => {
      inspect();
      return { completed: true, usage: { input: 100, output: 100, cached: 0 }, text: JSON.stringify({ gaps: [
        { id: "limited", statement: "Duplicate of a confirmed expectation", why: "x", scenario: "x" },
        { id: "headerBypass", statement: "Changing a request header does not reset the limit", why: "Spammers control headers", scenario: "Send a new address each time" },
      ] }) };
    },
  };
}
const run = (directory: string, preview: boolean, injected: ModelTransport, candidate?: string) =>
  proposeGaps(path.join(directory, "project.json"), path.join(directory, "case.json"), path.join(directory, "runs"), { budget: 0.25, preview, transport: injected, candidate });

it("previews the exact gap-finding export without calling a model", async () => {
  const directory = await fixture();
  let called = false;
  const draft = await run(directory, true, transport(() => { called = true; }));
  expect(called).toBe(false);
  expect(draft.proposalPath).toBeUndefined();
  const exported = JSON.parse(await readFile(draft.exportPath, "utf8"));
  expect(Object.keys(exported.input)).toEqual(["report", "confirmedExpectations", "sources"]);
  expect(await readdir(draft.directory)).not.toContain("model-usage.json");
});

it("records proposed expectations for review and drops ones already confirmed", async () => {
  const directory = await fixture();
  const draft = await run(directory, false, transport());
  const proposal = JSON.parse(await readFile(draft.proposalPath!, "utf8"));
  expect(proposal.status).toBe("needs-review");
  expect(proposal.gaps.map(({ id }: { id: string }) => id)).toEqual(["headerBypass"]);
});

it("reviews the source with a proposed fix applied and refuses fixes outside configured source", async () => {
  const directory = await fixture();
  const fix = path.join(directory, "fix.patch");
  await writeFile(fix, "diff --git a/main.js b/main.js\n--- a/main.js\n+++ b/main.js\n@@ -1 +1 @@\n-limit by first forwarded address\n+limit by connection address\n");
  const draft = await run(directory, true, transport(), fix);
  const exported = JSON.parse(await readFile(draft.exportPath, "utf8"));
  expect(exported.input.sources).toEqual({ "main.js": "limit by connection address\n" });
  expect(exported.input.proposedFix).toContain("+limit by connection address");
  expect(exported.instructions).toContain("proposed fix applied");
  const outside = path.join(directory, "outside.patch");
  await writeFile(outside, "diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n@@ -0,0 +1 @@\n+{}\n");
  await expect(run(directory, true, transport(), outside)).rejects.toThrow();
});

it("binds the outgoing export to the approved preview before even counting provider tokens", async () => {
  const directory = await fixture();
  const preview = await run(directory, true, transport());
  const options: GapOptions = { approvedExport: preview.exportPath, budget: 0.25, transport: transport() };
  const invoke = () => proposeGaps(path.join(directory, "project.json"), path.join(directory, "case.json"), path.join(directory, "runs"), options);
  const accepted = await invoke();
  expect(await readFile(accepted.exportPath)).toEqual(await readFile(preview.exportPath));
  expect(JSON.parse(await readFile(accepted.proposalPath!, "utf8")).approvedExportHash).toMatch(/^[a-f0-9]{64}$/);

  let calls = 0;
  options.transport = { ...transport(), count: async () => { calls++; return 100; } };
  await writeFile(path.join(directory, "app", "main.js"), "changed source\n");
  await expect(invoke()).rejects.toThrow("differs from the approved preview");
  expect(calls).toBe(0);
});

it("refuses a live request without a reviewed preview before any provider call", async () => {
  const directory = await fixture();
  let calls = 0;
  await expect(proposeGaps(path.join(directory, "project.json"), path.join(directory, "case.json"), path.join(directory, "runs"), {
    transport: { ...transport(), mode: "live", count: async () => { calls++; return 100; } },
  })).rejects.toThrow("requires an approved export preview");
  expect(calls).toBe(0);
});

it("rejects an altered approval artifact, report or candidate before model calls", async () => {
  const directory = await fixture();
  const preview = await run(directory, true, transport());
  let calls = 0;
  const options: GapOptions = { approvedExport: preview.exportPath, transport: {
    ...transport(), count: async () => { calls++; return 100; },
  } };
  const invoke = () => proposeGaps(path.join(directory, "project.json"), path.join(directory, "case.json"), path.join(directory, "runs"), options);
  const original = await readFile(preview.exportPath);
  await writeFile(preview.exportPath, Buffer.concat([original, Buffer.from(" ")]));
  await expect(invoke()).rejects.toThrow("differs from the approved preview");
  await writeFile(preview.exportPath, original);
  await writeFile(path.join(directory, "report.md"), "A changed report");
  await expect(invoke()).rejects.toThrow("differs from the approved preview");
  await writeFile(path.join(directory, "report.md"), "Spam gets through.");
  options.candidate = path.join(directory, "fix.patch");
  await writeFile(options.candidate, "--- a/main.js\n+++ b/main.js\n@@ -1 +1 @@\n-limit by first forwarded address\n+limit by connection address\n");
  await expect(invoke()).rejects.toThrow("differs from the approved preview");
  expect(calls).toBe(0);
});
