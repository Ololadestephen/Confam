import { writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { FrozenChecks, FinalFreeze } from "./freeze.js";
import { verifyChecks } from "./freeze.js";
import { readJson } from "./json.js";
import { git } from "./process.js";
import type { RunReport } from "./run-report.js";

const sealSchema = z.strictObject({
  schemaVersion: z.literal(1), version: z.number().int().min(1).max(3), frozenAt: z.string(),
  checks: z.strictObject({ directory: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  baselineRevision: z.string(),
});

export async function sealFinalChecks(directory: string, version: number, checks: FrozenChecks, baseline: string): Promise<FinalFreeze> {
  await verifyChecks(checks);
  const seal: FinalFreeze = { schemaVersion: 1, version, checks, frozenAt: new Date().toISOString(), baselineRevision: (await git(baseline, "rev-parse", "HEAD")).trim() };
  await writeFile(path.join(directory, "final-freeze.json"), JSON.stringify(seal, null, 2) + "\n", { flag: "wx" });
  return seal;
}

export async function loadFinalRun(directory: string) {
  const report = await readJson<RunReport>(path.join(directory, "manifest.json"));
  if (report.status !== "completed" || !report.finalFreeze) throw new Error("This run has no completed final freeze.");
  const seal = sealSchema.parse(await readJson(path.join(directory, "final-freeze.json")));
  if (!isDeepStrictEqual(seal, report.finalFreeze)) throw new Error("Final freeze seal does not match the run manifest.");
  if (path.resolve(seal.checks.directory) !== path.join(path.resolve(directory), "checks", `v${seal.version}`)) throw new Error("Frozen checks path escapes the run.");
  await verifyChecks(seal.checks);
  const baseline = path.join(directory, "baseline");
  if ((await git(baseline, "rev-parse", "HEAD")).trim() !== seal.baselineRevision || (await git(baseline, "status", "--porcelain")).trim()) {
    throw new Error("The specimen baseline changed after final freeze.");
  }
  const subject = await readJson<import("./contracts.js").BookingSubject>(path.join(seal.checks.directory, "subject.json"));
  return { report, seal, baseline, subject };
}
