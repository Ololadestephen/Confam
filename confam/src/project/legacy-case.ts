import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BookingSubject, ProbeObservation, VariantSpec } from "../engine/contracts.js";
import { loadProjectConfig } from "./config.js";
import { readJson } from "../engine/json.js";

export interface OracleContext {
  dbPath: string;
  baseUrl: string;
  restartApp(): Promise<void>;
}

export interface OracleProbe {
  description: string;
  run(context: OracleContext, subject: BookingSubject): Promise<ProbeObservation>;
}

async function loadDevelopmentDecoys(specimen: string, probes: Record<string, OracleProbe>): Promise<VariantSpec[]> {
  const decoys = await readJson<VariantSpec[]>(path.join(specimen, "decoys/development.json"));
  if (!Array.isArray(decoys)) throw new Error("Development decoys must be an array.");
  for (const decoy of decoys) {
    validateDecoy(decoy, probes);
    decoy.patch = path.join(specimen, "decoys", decoy.patch);
  }
  const ids = decoys.map((decoy) => decoy.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate development decoy IDs.");
  return decoys;
}

function validateDecoy(decoy: VariantSpec, probes: Record<string, OracleProbe>): asserts decoy is VariantSpec & { patch: string; } {
  if (!decoy || decoy.kind !== "development" || typeof decoy.id !== "string" || !/^[a-z0-9-]+$/.test(decoy.id)
    || ["original", "control-a", "control-b", "candidate"].includes(decoy.id)
    || typeof decoy.patch !== "string" || !decoy.patch || path.basename(decoy.patch) !== decoy.patch
    || typeof decoy.violation !== "string" || !decoy.violation
    || !Array.isArray(decoy.requirements) || decoy.requirements.length === 0) {
    throw new Error("Invalid development decoy definition.");
  }
  if (decoy.serverErrorIncludes !== undefined && (typeof decoy.serverErrorIncludes !== "string" || decoy.serverErrorIncludes.length === 0)) {
    throw new Error("Invalid server-error evidence requirement.");
  }
  for (const requirement of decoy.requirements) {
    if (!requirement || !Object.hasOwn(probes, requirement.probe) || typeof requirement.holds !== "boolean") throw new Error("Unknown oracle requirement.");
  }
}

export async function loadSalonCase(root: string, caseDirectory: string) {
  const expectedCase = path.join(root, "specimens/salon/cases/disappearing-booking");
  if (path.resolve(caseDirectory) !== expectedCase) throw new Error("Only the disappearing-booking salon case is supported in this engine slice.");
  const specimen = path.join(root, "specimens/salon");
  const project = await loadProjectConfig(path.join(specimen, "project.json"));
  const facts: {
    bookingCase: { customer: { phone: string; }; otherCustomer: { phone: string; }; service: string; slotLabel: string; };
    upcomingSaturday(): string;
    caseStartsAt(date: string): string;
  } = await import(pathToFileURL(path.join(caseDirectory, "case.js")).href);
  const date = facts.upcomingSaturday();
  const subject: BookingSubject = {
    customerPhone: facts.bookingCase.customer.phone,
    otherCustomerPhone: facts.bookingCase.otherCustomer.phone,
    service: facts.bookingCase.service,
    slotLabel: facts.bookingCase.slotLabel,
    date, startsAt: facts.caseStartsAt(date),
  };
  const { probes }: { probes: Record<string, OracleProbe>; } = await import(pathToFileURL(path.join(specimen, "probes/index.js")).href);
  const controls: VariantSpec[] = [
    { id: "control-a", kind: "control", patch: path.join(specimen, "controls/control-a-server-parsing.patch"), requirements: [] },
    { id: "control-b", kind: "control", patch: path.join(specimen, "controls/control-b-24h-slots-and-reload.patch"), requirements: [] },
  ];
  const decoys = await loadDevelopmentDecoys(specimen, probes);
  return { app: project.root, projectConfig: project.config, subject, probes, controls, decoys };
}
