import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BookingSubject, CheckDeclaration } from "./contracts.js";

export interface FrozenChecks {
  directory: string;
  sha256: string;
}

export interface FinalFreeze {
  schemaVersion: 1;
  version: number;
  frozenAt: string;
  checks: FrozenChecks;
  baselineRevision: string;
}

async function hashDirectory(directory: string): Promise<string> {
  const hash = createHash("sha256");
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (!entry.isFile()) throw new Error(`Checks contain a non-regular file: ${entry.name}`);
    const contents = await readFile(path.join(directory, entry.name));
    hash.update(JSON.stringify([entry.name, contents.length]));
    hash.update(contents);
  }
  return hash.digest("hex");
}

export async function freezeChecks(directory: string, source: string, subject: BookingSubject, assertions?: CheckDeclaration[]): Promise<FrozenChecks> {
  await mkdir(path.dirname(directory), { recursive: true });
  await mkdir(directory);
  await copyFile(source, path.join(directory, "checks.ts"));
  await writeFile(path.join(directory, "subject.json"), JSON.stringify(subject, null, 2));
  if (assertions) await writeFile(path.join(directory, "plan.json"), JSON.stringify(assertions, null, 2));
  return { directory, sha256: await hashDirectory(directory) };
}

export async function verifyChecks(checks: FrozenChecks): Promise<void> {
  if (await hashDirectory(checks.directory) !== checks.sha256) {
    throw new Error("Frozen checks hash mismatch; execution stopped.");
  }
}
