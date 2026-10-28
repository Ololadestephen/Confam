import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { BookingSubject, CheckDeclaration, VariantResult, VariantSpec } from "./contracts.js";
import { freezeChecks, verifyChecks, type FrozenChecks } from "./freeze.js";

export interface CheckVersion {
  version: number;
  checks: FrozenChecks;
  assertions?: CheckDeclaration[];
  results: VariantResult[];
  gatePassed: boolean;
}
export interface SurvivorEvidence {
  id: string;
  violation?: string;
  patch: string;
  probes: VariantResult["probes"];
}
export interface StrengtheningRequest {
  round: number;
  assertions: CheckDeclaration[];
  survivors: SurvivorEvidence[];
}
export interface StrengtheningProposal {
  assertions: CheckDeclaration[];
  reason: string;
  reviewReasons: string[];
}
export interface VersionOptions {
  directory: string;
  source: string;
  subject: BookingSubject;
  assertions?: CheckDeclaration[];
  controls: VariantSpec[];
  decoys(): Promise<VariantSpec[]>;
  evaluate(spec: VariantSpec, checks: FrozenChecks, version: number): Promise<VariantResult>;
  strengthen?: (request: StrengtheningRequest) => Promise<StrengtheningProposal>;
  changed(version: CheckVersion): Promise<void>;
}

function changedAssertions(before: CheckDeclaration[], after: CheckDeclaration[]): string[] {
  return before.filter((assertion) => !after.some((candidate) => isDeepStrictEqual(candidate, assertion)))
    .map(({ expectationId, observation }) => `An existing ${expectationId}/${observation} assertion was altered or removed.`);
}

export async function evaluateCheckVersions(options: VersionOptions) {
  const versions: CheckVersion[] = [];
  let assertions = options.assertions ? structuredClone(options.assertions) : undefined;
  let decoys: VariantSpec[] | undefined;
  let rounds = 0;
  let reason = "no-survivors";
  for (let version = 1; version <= 3; version += 1) {
    const directory = path.join(options.directory, "checks", `v${version}`);
    const checks = await freezeChecks(directory, options.source, options.subject, assertions);
    const record: CheckVersion = { version, checks, assertions: assertions ? structuredClone(assertions) : undefined, results: [], gatePassed: false };
    versions.push(record);
    const evaluate = async (spec: VariantSpec) => {
      await verifyChecks(checks);
      record.results.push(await options.evaluate(spec, checks, version));
      await options.changed(structuredClone(record));
    };
    await evaluate({ id: "original", kind: "original", requirements: [] });
    for (const control of options.controls) await evaluate(control);
    const controls = record.results.filter(({ kind }) => kind === "control");
    record.gatePassed = record.results[0]?.outcome === "bug-reproduced" && controls.length === 2 && controls.every(({ outcome }) => outcome === "passed");
    await options.changed(structuredClone(record));
    if (!record.gatePassed) return { status: "blocked" as const, versions, decoys: decoys ?? [], rounds, reason: "control-or-reproduction-gate" };
    decoys ??= await options.decoys();
    for (const decoy of decoys) await evaluate(decoy);
    await writeFile(path.join(options.directory, "checks", `v${version}-results.json`), JSON.stringify(record, null, 2) + "\n");
    const survivors = record.results.filter(({ kind, outcome }) => kind === "development" && outcome === "survived");
    if (survivors.length === 0) break;
    if (!options.strengthen || !assertions || rounds === 2) { reason = rounds === 2 ? "round-limit" : "strengthening-unavailable"; break; }
    const evidence: SurvivorEvidence[] = [];
    for (const survivor of survivors) {
      const spec = decoys.find(({ id }) => id === survivor.id);
      if (!spec?.patch) throw new Error("A surviving decoy has no archived patch.");
      evidence.push({ id: survivor.id, violation: survivor.violation, patch: await readFile(spec.patch, "utf8"), probes: survivor.probes });
    }
    rounds += 1;
    const proposal = await options.strengthen({ round: rounds, assertions: structuredClone(assertions), survivors: structuredClone(evidence) });
    const reviewReasons = [...proposal.reviewReasons, ...changedAssertions(assertions, proposal.assertions)];
    const proposals = path.join(options.directory, "checks/proposals");
    await mkdir(proposals, { recursive: true });
    const proposalPath = path.join(proposals, `round-${rounds}.json`);
    await writeFile(proposalPath, JSON.stringify({ ...proposal, reviewReasons }, null, 2) + "\n");
    if (reviewReasons.length > 0) return { status: "needs-review" as const, versions, decoys, rounds, reason: "expectation-change", proposalPath, reviewReasons };
    if (isDeepStrictEqual(proposal.assertions, assertions)) { reason = "verifier-no-change"; break; }
    assertions = structuredClone(proposal.assertions);
  }
  return { status: "ready" as const, versions, decoys: decoys ?? [], rounds, reason };
}
