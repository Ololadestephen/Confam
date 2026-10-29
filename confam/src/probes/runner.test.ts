import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { runProbes, probeRegistrySchema, probeSchema, type ProbeContext, type ProbeDefinition } from "./index.js";

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function context(): Promise<ProbeContext> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-probe-"));
  directories.push(directory);
  const dataDirectory = path.join(directory, "data");
  await mkdir(dataDirectory);
  return { dataDirectory, dataPath: path.join(dataDirectory, "state"), baseUrl: "http://127.0.0.1:4310", fixtures: { expected: 3 } };
}
const jsonProbe: ProbeDefinition = { id: "stateMatches", kind: "json-file", path: "state", pointer: ["items", "0", "count"], expected: { fixture: "expected" } };

it("compares independent JSON state using reviewed fixtures without coercion", async () => {
  const run = await context();
  await writeFile(run.dataPath, JSON.stringify({ items: [{ count: 3 }] }));
  expect((await runProbes([jsonProbe], run)).stateMatches).toEqual({ holds: true, observed: 3 });
  await writeFile(run.dataPath, JSON.stringify({ items: [{ count: "3" }] }));
  expect((await runProbes([jsonProbe], run)).stateMatches).toEqual({ holds: false, observed: "3" });
});
it("keeps missing files and pointers separate from observed false behavior", async () => {
  const run = await context();
  expect((await runProbes([jsonProbe], run)).stateMatches).toMatchObject({ holds: false, observed: null, error: expect.any(String) });
  await writeFile(run.dataPath, "{}");
  expect((await runProbes([jsonProbe], run)).stateMatches?.error).toContain("Missing observation pointer");
});
it("refuses symlink files and oversized JSON state", async () => {
  const run = await context();
  const other = path.join(run.dataDirectory, "other");
  await writeFile(other, "{}");
  await symlink(other, run.dataPath);
  expect((await runProbes([jsonProbe], run)).stateMatches?.error).toContain("Symlink");
  await rm(run.dataPath);
  await writeFile(run.dataPath, " ".repeat(1024 * 1024 + 1));
  expect((await runProbes([jsonProbe], run)).stateMatches?.error).toContain("bounded");
});
it("executes reviewed parameterized SELECT observations without modifying SQLite", async () => {
  const run = await context();
  const db = new DatabaseSync(run.dataPath);
  db.exec("CREATE TABLE items (owner TEXT, count INTEGER); INSERT INTO items VALUES ('sample',3)");
  db.close();
  const before = await readFile(run.dataPath);
  const probe: ProbeDefinition = { id: "savedCount", kind: "sqlite", query: "SELECT count AS value FROM items WHERE owner = ?", parameters: ["sample"], column: "value", expected: 3 };
  expect((await runProbes([probe], run)).savedCount).toEqual({ holds: true, observed: 3 });
  expect(await readFile(run.dataPath)).toEqual(before);
});
it.each(["DELETE FROM items", "SELECT 1; DELETE FROM items", "ATTACH DATABASE 'x' AS x", "SELECT 1 -- comment"])("rejects unsupported SQL %s", (query) => {
  expect(probeSchema.safeParse({ id: "query", kind: "sqlite", query, parameters: [], column: "value", expected: 1 }).success).toBe(false);
});
it("does not create a missing SQLite database", async () => {
  const run = await context();
  const probe: ProbeDefinition = { id: "row", kind: "sqlite", query: "SELECT 1 AS value", parameters: [], column: "value", expected: 1 };
  expect((await runProbes([probe], run)).row?.error).toBeTruthy();
  await expect(readFile(run.dataPath)).rejects.toThrow();
});
it("reads bounded same-origin HTTP JSON without following redirects", async () => {
  const run = await context();
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ count: 3 }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const probe: ProbeDefinition = { id: "endpoint", kind: "http-json", path: "/state", pointer: ["count"], expected: 3 };
  expect((await runProbes([probe], run)).endpoint).toEqual({ holds: true, observed: 3 });
  expect(fetch.mock.calls[0]?.[0].toString()).toBe(run.baseUrl + "/state");
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "error", signal: expect.any(AbortSignal) });
  fetch.mockResolvedValue(new Response("", { status: 302 }));
  expect((await runProbes([probe], run)).endpoint?.error).toContain("unavailable");
});
it("enforces HTTP size limits and external cancellation", async () => {
  const run = await context();
  const fetch = vi.fn().mockResolvedValue(new Response(" ".repeat(1024 * 1024 + 1), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const probe: ProbeDefinition = { id: "endpoint", kind: "http-json", path: "/state", pointer: [], expected: null };
  expect((await runProbes([probe], run)).endpoint?.error).toContain("observation limit");
  const abort = new AbortController(); abort.abort("");
  fetch.mockClear();
  expect((await runProbes([probe], { ...run, signal: abort.signal })).endpoint?.error).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects path escapes, prototype references and duplicate registry IDs", () => {
  expect(probeSchema.safeParse({ ...jsonProbe, path: "../outside" }).success).toBe(false);
  expect(probeSchema.safeParse({ ...jsonProbe, pointer: ["constructor"] }).success).toBe(false);
  expect(probeSchema.safeParse({ ...jsonProbe, expected: { fixture: "__proto__.value" } }).success).toBe(false);
  expect(probeRegistrySchema.safeParse([jsonProbe, jsonProbe]).success).toBe(false);
});
