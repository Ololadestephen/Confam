import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadProjectConfig } from "./config.js";
import { createProjectLifecycle } from "./runtime.js";
import { createVariant, prepareBaseline } from "../engine/variants.js";

// This checks project setup, not application behavior or repair correctness.
export async function checkProject(configPath: string, runsDirectory: string) {
  const project = await loadProjectConfig(configPath);
  const directory = path.resolve(runsDirectory, `project-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const baseline = await prepareBaseline(project.root, directory, project.config);
  const variant = path.join(directory, "variant");
  const app = path.join(variant, "app");
  await createVariant(baseline, app);
  const lifecycle = createProjectLifecycle(app, variant, project.config.runtime);
  let restarted = false;
  try {
    await lifecycle.reset();
    await lifecycle.start();
    if (project.config.runtime.restart) {
      await lifecycle.restart();
      restarted = true;
    }
  } finally {
    await lifecycle.stop();
  }
  await lifecycle.reset();
  const report = {
    schemaVersion: 1, project: project.config.id, status: "ready", restarted, dataReset: true,
    scope: "Runtime configuration only; no behavioral checks or candidate repair evaluated."
  };
  const reportPath = path.join(directory, "project-check.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  return { report, reportPath };
}
