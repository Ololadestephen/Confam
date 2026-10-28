import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { git } from "../engine/process.js";
import { prepareBaseline } from "../engine/variants.js";
import { readProjectSnapshot, PROJECT_SNAPSHOT } from "./snapshot.js";

it("limits legacy fallback to committed baselines without a project snapshot", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-snapshot-"));
  try {
    const app = path.join(directory, "app");
    await mkdir(app);
    await writeFile(path.join(app, "example.txt"), "example");
    const baseline = await prepareBaseline(app, directory);
    expect((await readProjectSnapshot(baseline)).id).toBe("salon");
    await rm(path.join(baseline, PROJECT_SNAPSHOT));
    await expect(readProjectSnapshot(baseline)).rejects.toThrow();
    await git(baseline, "add", "-u");
    await git(baseline, "-c", "commit.gpgsign=false", "-c", "user.name=Confam", "-c", "user.email=local@confam.invalid", "commit", "-qm", "Historical baseline fixture");
    expect((await readProjectSnapshot(baseline)).id).toBe("salon");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
