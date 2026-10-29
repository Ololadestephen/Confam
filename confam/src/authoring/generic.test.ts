import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { proposeWorkflow } from "./generic.js";
import type { ModelTransport } from "../models/client.js";

it("creates a review-only workflow proposal through the shared model client and ledger", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-generic-authoring-"));
  try {
    const app = path.join(directory, "app"); await mkdir(app);
    await writeFile(path.join(app, "main.js"), "application source");
    await writeFile(path.join(directory, "report.md"), "The total does not update.");
    await writeFile(path.join(directory, "project.json"), JSON.stringify({
      schemaVersion: 1, id: "quote", root: "app", sourceFiles: ["main.js"], runtime: {
        command: ["node", "main.js"], readinessPath: "/ready", portVariable: "PORT", dataVariable: "STATE", restart: false,
      }
    }));
    await writeFile(path.join(directory, "case.json"), JSON.stringify({
      schemaVersion: 1, id: "total", projectId: "quote", report: "report.md", fixtures: {},
      expectations: [{ id: "totalCorrect", statement: "The total is correct", provenance: "developer" }], reproductionTargets: ["totalCorrect"], mode: "verification"
    }));
    const plan = {
      schemaVersion: 1, steps: [{ action: "navigate", path: "/" }, { action: "reached" },
      { action: "capture", locator: { kind: "css", value: "#total" }, kind: "number", capture: "total" },
      { action: "assert", expectationId: "totalCorrect", actual: { variable: "total" }, operator: "eq", expected: 30 }]
    };
    let sent = "";
    const transport: ModelTransport = {
      mode: "fixture", count: async () => 100, generate: async (request) => {
        sent = request.input;
        return { text: JSON.stringify(plan), completed: true, usage: { input: 100, output: 100, cached: 0 } };
      }
    };
    const result = await proposeWorkflow(path.join(directory, "project.json"), path.join(directory, "case.json"), path.join(directory, "runs"), 0.25, transport);
    expect(sent).toContain("totalCorrect"); expect(sent).toContain("application source");
    expect(result.usage.estimatedSpendUsd).toBe(0);
    expect(JSON.parse(await readFile(path.join(result.directory, "proposal.json"), "utf8"))).toMatchObject({ status: "needs-review", mode: "fixture" });
    expect(JSON.parse(await readFile(result.workflowPath, "utf8"))).toEqual(plan);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
