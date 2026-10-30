import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { normalizeModelPatch, proposeDecoys, repairModelDiff } from "./generic-decoys.js";
import { git } from "../engine/process.js";
import type { ModelTransport } from "../models/client.js";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
function patch(file: string, before: string, after: string): string {
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-${before}\n+${after}\n`;
}
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-decoy-authoring-")); directories.push(directory);
  const app = path.join(directory, "app"); await mkdir(app);
  await writeFile(path.join(app, "main.js"), "original\n");
  await writeFile(path.join(directory, "project.json"), JSON.stringify({
    schemaVersion: 1, id: "sample", root: "app", sourceFiles: ["main.js"], runtime: {
      command: ["node", "main.js"], readinessPath: "/ready", portVariable: "PORT", dataVariable: "STATE", restart: false,
    }
  }));
  await writeFile(path.join(directory, "case.json"), JSON.stringify({
    schemaVersion: 1, id: "example", projectId: "sample", report: "report.md", fixtures: {},
    expectations: [{ id: "persists", statement: "Saved state survives reopening", provenance: "developer" }], reproductionTargets: ["persists"],
    mode: "verification", controls: [{ id: "correct", patch: "correct.patch" }]
  }));
  await writeFile(path.join(directory, "correct.patch"), patch("main.js", "original", "corrected"));
  await writeFile(path.join(directory, "report.md"), "Saved state disappears.");
  const probes = [{ id: "saved", kind: "json-file", path: "state", pointer: ["saved"], expected: true }];
  const registryText = JSON.stringify(probes, null, 4) + "\n";
  await writeFile(path.join(directory, "probes.json"), registryText);
  return { directory, probes, registryText };
}
function transport(diff: string, inspect: (input: string) => void = () => undefined): ModelTransport {
  return {
    mode: "fixture", count: async () => 100, generate: async (request) => {
      inspect(request.input);
      return {
        completed: true, usage: { input: 100, output: 100, cached: 0 }, text: JSON.stringify({
          decoys: [{
            id: "missingWrite", violation: "The repair fails to save state", expectationIds: ["persists"],
            requirements: [{ probe: "saved", holds: false }], patch: diff,
          }]
        })
      };
    }
  };
}
async function propose(directory: string, injected: ModelTransport, preview = false) {
  return proposeDecoys(path.join(directory, "project.json"), path.join(directory, "case.json"), path.join(directory, "probes.json"),
    "correct", path.join(directory, "runs"), { budget: 0.25, transport: injected, preview });
}
it("drafts guarded patches from corrected source while preserving reviewed probe definitions", async () => {
  const { directory, probes, registryText } = await fixture();
  let input: Record<string, unknown> = {};
  const result = await propose(directory, transport(patch("main.js", "corrected", "broken"), (text) => { input = JSON.parse(text); }));
  expect(input.correctedSource).toEqual({ "main.js": "corrected\n" });
  expect(input.reviewedProbes).toEqual(probes);
  const manifest = JSON.parse(await readFile(result.manifestPath!, "utf8"));
  expect(manifest.probes).toEqual(probes);
  expect(manifest.purpose).toBe("development");
  expect(manifest.decoys[0]).toMatchObject({ baseControl: "correct", patch: "decoy-missingWrite.patch" });
  expect(await readFile(path.join(result.directory, "reviewed-probes.json"), "utf8")).toBe(registryText);
  expect(JSON.parse(await readFile(path.join(result.directory, "proposal.json"), "utf8"))).toMatchObject({ status: "needs-review", mode: "fixture" });
  expect(result.usage!.estimatedSpendUsd).toBe(0);
  expect(await readFile(path.join(directory, "app/main.js"), "utf8")).toBe("original\n");
});
it("rejects a model patch touching protected verification infrastructure", async () => {
  const { directory } = await fixture();
  await expect(propose(directory, transport(patch("tests/check.js", "corrected", "broken")))).rejects.toThrow("protected or unsupported");
  const runs = await readdir(path.join(directory, "runs"));
  await expect(readFile(path.join(directory, "runs", runs[0]!, "development.json"))).rejects.toThrow();
});
it("rejects a diff against original source instead of the corrected reference", async () => {
  const { directory } = await fixture();
  await expect(propose(directory, transport(patch("main.js", "original", "broken")))).rejects.toThrow();
});

it.each(["probe", "expectation", "positive-only"])("rejects invalid model evidence references: %s", async (violation) => {
  const { directory } = await fixture();
  const injected = transport(patch("main.js", "corrected", "broken"));
  const generate = injected.generate;
  injected.generate = async (request) => {
    const response = await generate(request);
    const proposal = JSON.parse(response.text);
    if (violation === "probe") proposal.decoys[0].requirements[0].probe = "unknown";
    if (violation === "expectation") proposal.decoys[0].expectationIds = ["unknown"];
    if (violation === "positive-only") proposal.decoys[0].requirements[0].holds = true;
    return { ...response, text: JSON.stringify(proposal) };
  };
  await expect(propose(directory, injected)).rejects.toThrow();
});

it("normalizes a model diff with wrong hunk counts and no git header, leaving the worktree clean", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-normalize-")); directories.push(directory);
  await writeFile(path.join(directory, "main.js"), "one\ntwo\nthree\nfour\n");
  await git(directory, "init", "-q");
  await git(directory, "add", "-A");
  const raw = path.join(directory, "..", `${path.basename(directory)}-raw.patch`); directories.push(raw);
  // Header claims 7/8 lines but the hunk has 4/5, as model-written diffs often do.
  await writeFile(raw, "--- a/main.js\n+++ b/main.js\n@@ -1,7 +1,8 @@\n one\n two\n+inserted\n three\n four\n");
  const normalized = await normalizeModelPatch(directory, raw);
  expect(normalized).toContain("diff --git a/main.js b/main.js");
  expect(normalized).toContain("@@ -1,4 +1,5 @@");
  expect(await readFile(path.join(directory, "main.js"), "utf8")).toBe("one\ntwo\nthree\nfour\n");
});

it("repairs a missing final newline and missing file lines after a git header", () => {
  expect(repairModelDiff("--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b")).toBe("--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n");
  expect(repairModelDiff("diff --git a/x.js b/x.js\n@@ -1 +1 @@\n-a\n+b\n"))
    .toBe("diff --git a/x.js b/x.js\n--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-a\n+b\n");
  const complete = "diff --git a/x.js b/x.js\nindex 1..2 100644\n--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-a\n+b\n";
  expect(repairModelDiff(complete)).toBe(complete);
});

it("keeps applicable decoys and records a proposal whose diff does not apply as rejected", async () => {
  const { directory } = await fixture();
  const decoy = (id: string, diff: string) => ({ id, violation: "The repair fails to save state", expectationIds: ["persists"], requirements: [{ probe: "saved", holds: false }], patch: diff });
  const twoDecoys: ModelTransport = {
    mode: "fixture", count: async () => 100, generate: async () => ({
      completed: true, usage: { input: 100, output: 100, cached: 0 },
      text: JSON.stringify({ decoys: [decoy("applies", patch("main.js", "corrected", "broken")), decoy("misquoted", patch("main.js", "not in the file", "broken"))] }),
    }),
  };
  const draft = await propose(directory, twoDecoys);
  const manifest = JSON.parse(await readFile(draft.manifestPath!, "utf8"));
  expect(manifest.decoys.map((entry: { id: string }) => entry.id)).toEqual(["applies"]);
  expect(draft.rejected.map(({ id }) => id)).toEqual(["misquoted"]);
  const proposal = JSON.parse(await readFile(path.join(draft.directory, "proposal.json"), "utf8"));
  expect(proposal.rejectedAtAuthoring[0].id).toBe("misquoted");
});
it("previews the exact decoy export without creating a ledger or calling a model", async () => {
  const { directory, probes } = await fixture();
  let called = false;
  const draft = await propose(directory, transport("unused", () => { called = true; }), true);
  expect(called).toBe(false);
  expect(draft.manifestPath).toBeUndefined();
  const exported = JSON.parse(await readFile(draft.exportPath, "utf8"));
  expect(exported.input.reviewedProbes).toEqual(probes);
  expect(exported.input.correctedSource).toEqual({ "main.js": "corrected\n" });
  expect(exported.instructions).toContain("Checks stop at the first failed expectation");
  expect(await readdir(draft.directory)).not.toContain("model-usage.json");
});
