import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import { loadEvaluationPack } from "./load.js";
import { evaluationPackSchema } from "./schema.js";
import { caseDefinitionSchema } from "../project/case.js";
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const definition = caseDefinitionSchema.parse({
  schemaVersion: 1, id: "case", projectId: "example", report: "report.md", fixtures: {}, mode: "verification",
  expectations: [{ id: "persists", statement: "State persists", provenance: "developer" }], reproductionTargets: ["persists"], controls: [{ id: "good", patch: "good.patch" }]
});
const decoy = { id: "fault", baseControl: "good", patch: "fault.patch", violation: "State missing", expectationIds: ["persists"], requirements: [{ probe: "saved", holds: false }] };
it("rejects all-positive and unknown-probe decoy declarations", async () => {
  expect(evaluationPackSchema.safeParse({ schemaVersion: 1, purpose: "held-out", label: "test", decoys: [{ ...decoy, requirements: [{ probe: "saved", holds: true }] }] }).success).toBe(false);
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-pack-load-")); directories.push(directory);
  const file = path.join(directory, "pack.json");
  await writeFile(file, JSON.stringify({ schemaVersion: 1, purpose: "integration-fixture", label: "test", decoys: [decoy] }));
  await expect(loadEvaluationPack(file, definition, [])).rejects.toThrow("Unknown independent probe");
});
it("rejects traversal and symlink patch inputs", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-pack-path-")); directories.push(directory);
  await mkdir(path.join(directory, "pack"));
  await writeFile(path.join(directory, "outside.patch"), "outside");
  await symlink("../outside.patch", path.join(directory, "pack/fault.patch"));
  const file = path.join(directory, "pack/pack.json");
  const probes = [{ id: "saved", kind: "json-file" as const, path: "state", pointer: ["saved"], expected: true }];
  await writeFile(file, JSON.stringify({ schemaVersion: 1, purpose: "integration-fixture", label: "test", decoys: [decoy] }));
  await expect(loadEvaluationPack(file, definition, probes)).rejects.toThrow("Symlink");
  await writeFile(file, JSON.stringify({ schemaVersion: 1, purpose: "integration-fixture", label: "test", decoys: [{ ...decoy, patch: "../outside.patch" }] }));
  await expect(loadEvaluationPack(file, definition, probes)).rejects.toThrow();
});
