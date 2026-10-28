import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createVariant, guardPatch, prepareBaseline } from "./variants.js";

const directories: string[] = [];
const specimen = fileURLToPath(new URL("../../../specimens/salon", import.meta.url));
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-variants-"));
  directories.push(directory);
  return { directory, baseline: await prepareBaseline(path.join(specimen, "app"), directory) };
}

describe("variant isolation and patch guard", () => {
  it("applies an app-only patch to a separate worktree and preserves the baseline", async () => {
    const { directory, baseline } = await fixture();
    const original = await readFile(path.join(baseline, "server.js"), "utf8");
    const variant = path.join(directory, "control");
    await createVariant(baseline, variant, path.join(specimen, "controls/control-a-server-parsing.patch"));
    expect(await readFile(path.join(variant, ".git"), "utf8")).toContain("gitdir:");
    expect(await readFile(path.join(variant, "server.js"), "utf8")).not.toBe(original);
    expect(await readFile(path.join(baseline, "server.js"), "utf8")).toBe(original);
  });

  it.each(["checks/checks.ts", "probes/index.js", "tests/smoke.spec.js", "package.json", "../runner.ts"])("rejects protected path %s", async (file) => {
    const { directory, baseline } = await fixture();
    const patch = path.join(directory, "unsafe.patch");
    await writeFile(patch, `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-old\n+new\n`);
    await expect(guardPatch(baseline, patch)).rejects.toThrow();
  });

  it("rejects a symlink disguised as an app file", async () => {
    const { directory, baseline } = await fixture();
    const patch = path.join(directory, "link.patch");
    await writeFile(patch, "diff --git a/server.js b/server.js\nold mode 100644\nnew mode 120000\n--- a/server.js\n+++ b/server.js\n@@ -1 +1 @@\n-old\n+../checks/checks.ts\n");
    await expect(guardPatch(baseline, patch)).rejects.toThrow("file modes");
  });
});
