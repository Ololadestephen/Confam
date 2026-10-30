import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { proposeFix, type FixOptions } from "./generic-fixer.js";
import type { ModelTransport } from "../models/client.js";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-fixer-")); directories.push(directory);
  const app = path.join(directory, "app"); await mkdir(app);
  await writeFile(path.join(app, "main.js"), "one\ntwo\nthree\n");
  await writeFile(path.join(directory, "project.json"), JSON.stringify({
    schemaVersion: 1, id: "sample", root: "app", sourceFiles: ["main.js"], runtime: {
      command: ["node", "main.js"], readinessPath: "/ready", portVariable: "PORT", dataVariable: "STATE", restart: false,
    }
  }));
  await writeFile(path.join(directory, "case.json"), JSON.stringify({
    schemaVersion: 1, id: "example", projectId: "sample", report: "report.md", fixtures: {},
    expectations: [{ id: "persists", statement: "Saved state survives reopening", provenance: "developer" }], reproductionTargets: ["persists"],
    mode: "verification", controls: [],
  }));
  await writeFile(path.join(directory, "report.md"), "Saved state disappears.");
  return directory;
}
function transport(patch: string, inspect: (instructions: string, input: string) => void = () => undefined): ModelTransport {
  return {
    mode: "fixture", count: async () => 100, generate: async (request) => {
      inspect(request.instructions, request.input);
      return { completed: true, usage: { input: 100, output: 100, cached: 0 }, text: JSON.stringify({ patch }) };
    },
  };
}
const runFix = (directory: string, options: FixOptions) =>
  proposeFix(path.join(directory, "project.json"), path.join(directory, "case.json"), path.join(directory, "runs"), options);

it("previews the exact export without creating a ledger or calling a model", async () => {
  const directory = await fixture();
  let called = false;
  const draft = await runFix(directory, { preview: true, transport: transport("unused", () => { called = true; }) });
  expect(called).toBe(false);
  expect(draft.patchPath).toBeUndefined();
  const exported = JSON.parse(await readFile(draft.exportPath, "utf8"));
  expect(Object.keys(exported.input)).toEqual(["report", "expectations", "sources"]);
  expect(exported.input.sources).toEqual({ "main.js": "one\ntwo\nthree\n" });
  expect(await readdir(draft.directory)).not.toContain("model-usage.json");
});

it("normalizes a sloppy model diff into a candidate patch limited to configured source", async () => {
  const directory = await fixture();
  let sentInstructions = "";
  const draft = await runFix(directory, {
    budget: 0.25,
    transport: transport("--- a/main.js\n+++ b/main.js\n@@ -1,9 +1,10 @@\n one\n two\n+saved\n three\n", (instructions) => { sentInstructions = instructions; }),
  });
  expect(sentInstructions).toContain("only these existing files: main.js");
  const candidate = await readFile(draft.patchPath!, "utf8");
  expect(candidate).toContain("diff --git a/main.js b/main.js");
  expect(candidate).toContain("@@ -1,3 +1,4 @@");
});

it("rejects a model fix that touches files outside the configured source", async () => {
  const directory = await fixture();
  const diff = "--- a/package.json\n+++ b/package.json\n@@ -0,0 +1 @@\n+{}\n";
  await expect(runFix(directory, { budget: 0.25, transport: transport(diff) })).rejects.toThrow();
});
