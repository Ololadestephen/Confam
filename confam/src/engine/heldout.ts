import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { loadFinalRun } from "./final-freeze.js";
import { verifyChecks } from "./freeze.js";
import { readJson } from "./json.js";
import { loadSalonCase } from "./salon.js";
import { evaluateVariant } from "./evaluate.js";
import { clientVerdict, countDecoys, evidenceSummary } from "./report.js";
import { sessionDirectory, withSessionLock, writeArtifact } from "../authoring/session.js";
import type { VariantResult, VariantSpec } from "./contracts.js";
import { errorMessage } from "./process.js";

export const heldOutPackSchema = z.strictObject({
  schemaVersion: z.literal(1), purpose: z.enum(["held-out", "integration-fixture"]), label: z.string().min(1).max(1000),
  decoys: z.array(z.strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/), patch: z.string().min(1), violation: z.string().min(1).max(2000),
    requirements: z.array(z.strictObject({ probe: z.enum(["appointment-saved", "appointment-owned-by-customer", "appointment-survives-restart"]), holds: z.boolean() })).min(1).max(3),
  })).min(1).max(20),
});

// This loader is used only by the explicit post-freeze evaluation command.
// Development authoring and strengthening never receive this pack or its results.
export async function readEvaluationPack(file: string) {
  if (!(await lstat(file)).isFile()) throw new Error("Evaluation pack must be a regular file.");
  const pack = heldOutPackSchema.parse(await readJson(file));
  const base = await realpath(path.dirname(file));
  if (new Set(pack.decoys.map(({ id }) => id)).size !== pack.decoys.length) throw new Error("Duplicate evaluation decoy IDs.");
  const patches: { spec: VariantSpec; contents: Buffer; }[] = [];
  const hash = createHash("sha256").update(JSON.stringify(pack));
  for (const decoy of pack.decoys) {
    if (path.isAbsolute(decoy.patch) || decoy.patch.split(/[\\/]/).includes("..")) throw new Error("Evaluation patch path escapes its pack.");
    const candidate = path.resolve(base, decoy.patch);
    if (!(await lstat(candidate)).isFile()) throw new Error("Evaluation patch must be a regular file.");
    const resolved = await realpath(candidate);
    if (!resolved.startsWith(base + path.sep)) throw new Error("Evaluation patch path escapes its pack.");
    if (new Set(decoy.requirements.map(({ probe }) => probe)).size !== decoy.requirements.length) throw new Error("Duplicate oracle requirements.");
    if (!decoy.requirements.some(({ holds }) => holds === false)) throw new Error("A held-out decoy must declare an independently observed violation, not only correct behavior.");
    if (decoy.requirements.some(({ probe, holds }) => probe === "appointment-owned-by-customer" && holds === false)
      && !decoy.requirements.some(({ probe, holds }) => probe === "appointment-saved" && holds === true)) {
      throw new Error("Wrong-owner evidence requires a saved row as well as failed ownership.");
    }
    const contents = await readFile(resolved);
    hash.update(JSON.stringify([decoy.id, contents.length])).update(contents);
    patches.push({ spec: { id: `heldout-${decoy.id}`, kind: "held-out", violation: decoy.violation, requirements: decoy.requirements }, contents });
  }
  return { pack, patches, sha256: hash.digest("hex") };
}

export async function evaluateHeldOut(root: string, id: string, packFile: string) {
  const directory = sessionDirectory(root, id);
  return withSessionLock(directory, async () => {
    const final = await loadFinalRun(directory);
    const loaded = await readEvaluationPack(packFile);
    if (loaded.pack.purpose === "held-out" && final.report.provenance?.mode === "fixture") throw new Error("A scripted fixture run cannot claim production held-out evaluation.");
    if (loaded.pack.purpose === "held-out" && final.report.heldOut.evaluated) throw new Error("This frozen run already has a held-out evaluation; do not reuse its results for tuning.");
    const evaluationDirectory = path.join(directory, "evaluations", `heldout-${randomUUID()}`);
    await mkdir(path.join(evaluationDirectory, "patches"), { recursive: true });
    const reportPath = path.join(evaluationDirectory, "report.json");
    if (loaded.pack.purpose === "held-out") {
      await writeFile(path.join(directory, "heldout-attempt.json"), JSON.stringify({ reportPath, packSha256: loaded.sha256 }) + "\n", { flag: "wx" });
    }
    const results: VariantResult[] = [];
    const evaluation = { schemaVersion: 1, purpose: loaded.pack.purpose, label: loaded.pack.label, packSha256: loaded.sha256, frozenChecks: final.seal.checks, status: "running", results, counts: countDecoys(results), error: undefined as string | undefined };
    await writeArtifact(evaluationDirectory, "pack.json", loaded.pack);
    await writeArtifact(evaluationDirectory, "report.json", evaluation);
    try {
      const salon = await loadSalonCase(root, path.resolve(root, final.report.case));
      for (const { spec, contents } of loaded.patches) {
        await verifyChecks(final.seal.checks);
        const patch = path.join(evaluationDirectory, "patches", `${spec.id}.patch`);
        await writeFile(patch, contents);
        results.push(await evaluateVariant({ ...spec, patch }, { baseline: final.baseline, runDirectory: evaluationDirectory, checks: final.seal.checks, subject: final.subject, probes: salon.probes }));
        evaluation.counts = countDecoys(results);
        await writeArtifact(evaluationDirectory, "report.json", evaluation);
      }
      await verifyChecks(final.seal.checks);
      evaluation.status = "completed";
      await writeArtifact(evaluationDirectory, "report.json", evaluation);
      if (loaded.pack.purpose === "held-out") {
        final.report.heldOut = { evaluated: true, reportPath, ...evaluation.counts };
        final.report.limitations = final.report.limitations.filter((line) => !line.startsWith("Held-out evaluation is pending"));
        final.report.limitations.push(`Held-out results cover ${evaluation.counts.caught + evaluation.counts.survived} oracle-confirmed patches; ${evaluation.counts.uncounted} were uncounted.`);
        final.report.client = clientVerdict(final.report);
        final.report.verdict = evidenceSummary(final.report);
        await writeArtifact(directory, "manifest.json", final.report);
      }
    } catch (error) { evaluation.status = "error"; evaluation.error = errorMessage(error); }
    await writeArtifact(evaluationDirectory, "report.json", evaluation);
    return { evaluation, reportPath };
  });
}
