import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { confinedPath } from "../project/config.js";
import { errorMessage } from "../engine/process.js";
import { probeRegistrySchema, observePointer, resolveExpected, type ProbeContext, type ProbeDefinition, type ProbeObservation } from "./schema.js";

const MAX_OBSERVATION_BYTES = 1024 * 1024;
const HTTP_DEADLINE_MS = 5000;

async function readJsonFile(context: ProbeContext, relative: string): Promise<unknown> {
  const file = await confinedPath(context.dataDirectory, relative);
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const entry = await handle.stat();
    if (!entry.isFile() || entry.size > MAX_OBSERVATION_BYTES) throw new Error("Probe state must be a bounded regular JSON file.");
    const content = await handle.readFile({ encoding: "utf8" });
    if (Buffer.byteLength(content) > MAX_OBSERVATION_BYTES) throw new Error("Probe state exceeds the observation limit.");
    try { return JSON.parse(content); }
    catch { throw new Error("Probe state is not valid JSON."); }
  } finally { await handle.close(); }
}

async function readSqlite(probe: Extract<ProbeDefinition, { kind: "sqlite" }>, context: ProbeContext): Promise<unknown> {
  const relative = path.relative(path.resolve(context.dataDirectory), path.resolve(context.dataPath));
  const file = await confinedPath(context.dataDirectory, relative);
  if (!(await lstat(file)).isFile()) throw new Error("Probe database must be a regular file.");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const parameters = probe.parameters.map((value): SQLInputValue => {
      const resolved = resolveExpected(value, context.fixtures);
      return typeof resolved === "boolean" ? Number(resolved) : resolved;
    });
    const row = db.prepare(probe.query).get(...parameters);
    if (!row || !Object.hasOwn(row, probe.column)) throw new Error("Probe query did not return the declared observation column.");
    return row[probe.column];
  } finally { db.close(); }
}

async function readHttpJson(context: ProbeContext, relative: string): Promise<unknown> {
  const base = new URL(context.baseUrl);
  const target = new URL(relative, base);
  if (!["http:", "https:"].includes(base.protocol) || target.origin !== base.origin) throw new Error("Probe URL escapes the project origin.");
  const signal = context.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(HTTP_DEADLINE_MS)]) : AbortSignal.timeout(HTTP_DEADLINE_MS);
  const response = await fetch(target, { redirect: "error", signal });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Probe HTTP observation unavailable (${response.status}).`);
  }
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_OBSERVATION_BYTES) throw new Error("Probe HTTP body exceeds the observation limit.");
      parts.push(chunk.value);
    }
  } finally { await reader.cancel(); }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw new Error("Probe HTTP response is not valid JSON."); }
}

async function execute(probe: ProbeDefinition, context: ProbeContext): Promise<unknown> {
  switch (probe.kind) {
    case "json-file": return observePointer(await readJsonFile(context, probe.path), probe.pointer);
    case "sqlite": return readSqlite(probe, context);
    case "http-json": return observePointer(await readHttpJson(context, probe.path), probe.pointer);
    default: throw new Error("Unsupported probe adapter.");
  }
}

export async function runProbes(input: ProbeDefinition[], context: ProbeContext): Promise<Record<string, ProbeObservation>> {
  const definitions = probeRegistrySchema.parse(input);
  const observations: Record<string, ProbeObservation> = Object.create(null);
  for (const probe of definitions) {
    try {
      context.signal?.throwIfAborted();
      const expected = resolveExpected(probe.expected, context.fixtures);
      const observed = await execute(probe, context);
      context.signal?.throwIfAborted();
      observations[probe.id] = { holds: isDeepStrictEqual(observed, expected), observed };
    } catch (error) {
      observations[probe.id] = { holds: false, observed: null, error: errorMessage(error) || "Probe execution failed." };
    }
  }
  return observations;
}
