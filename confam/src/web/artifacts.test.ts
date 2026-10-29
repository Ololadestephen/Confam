import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { boundedJson, redact } from "./artifacts.js";
it("rejects malformed and symlinked metadata rather than accepting partial evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "confam-metadata-"));
  try {
    const file = path.join(root, "report.json");
    await writeFile(file, '{"status":');
    await expect(boundedJson(file)).rejects.toThrow("incomplete or invalid");
    await symlink(file, path.join(root, "link.json"));
    await expect(boundedJson(path.join(root, "link.json"))).rejects.toThrow("regular file");
  } finally { await rm(root, { recursive: true, force: true }); }
});
it("redacts nested credentials and obvious personal identifiers in exported observations", () => {
  const value = redact({ password: "hidden", nested: [{ actual: "password=hidden https://example.com/?token=hidden a@example.com +234 800 123 4567" }] }, true);
  expect(JSON.stringify(value)).not.toContain("hidden");
  expect(JSON.stringify(value)).not.toContain("a@example.com");
  expect(JSON.stringify(value)).not.toContain("800 123");
});
