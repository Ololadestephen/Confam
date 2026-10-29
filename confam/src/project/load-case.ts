import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { readJson } from "../engine/json.js";
import { caseDefinitionSchema } from "./case.js";
import { confinedPath, loadProjectConfig } from "./config.js";

export async function loadVerificationCase(configPath: string, casePath: string) {
  const project = await loadProjectConfig(configPath);
  if (!(await lstat(casePath)).isFile()) throw new Error("Case definition must be a regular file.");
  const definition = caseDefinitionSchema.parse(await readJson(casePath));
  if (definition.projectId !== project.config.id) throw new Error("Case belongs to a different project.");
  const directory = path.dirname(casePath);
  const reportPath = await confinedPath(directory, definition.report);
  if (!(await lstat(reportPath)).isFile()) throw new Error("Bug report must be a regular file.");
  const report = await readFile(reportPath, "utf8");
  if (definition.recording && !(await lstat(await confinedPath(directory, definition.recording))).isFile()) {
    throw new Error("Recording must be a regular file.");
  }
  const controls = [];
  for (const control of definition.controls) {
    const file = await confinedPath(directory, control.patch);
    if (!(await lstat(file)).isFile()) throw new Error("Control patch must be a regular file.");
    controls.push({ id: control.id, contents: await readFile(file, "utf8") });
  }
  return { project, definition, report, controls };
}
