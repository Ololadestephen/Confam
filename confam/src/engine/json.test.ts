import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { readJson } from "./json.js";

it("reports malformed JSON with its source path instead of a bare parser error", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-json-"));
  const file = path.join(directory, "input.json");
  try {
    await writeFile(file, '{"value":1}');
    expect(await readJson(file)).toEqual({ value: 1 });
    await writeFile(file, "broken JSON");
    await expect(readJson(file)).rejects.toThrow(`Invalid JSON in ${file}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
