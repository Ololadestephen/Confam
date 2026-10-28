import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { readJson } from "../engine/json.js";
import { git } from "../engine/process.js";
import { projectConfigSchema } from "./config.js";
import { legacyProjectConfig } from "./legacy.js";

export const PROJECT_SNAPSHOT = ".confam-project.json";

export async function readProjectSnapshot(baseline: string) {
  const tracked = (await git(baseline, "ls-tree", "--name-only", "HEAD", "--", PROJECT_SNAPSHOT)).trim();
  if (!tracked) return legacyProjectConfig();
  const file = path.join(baseline, PROJECT_SNAPSHOT);
  if (!(await lstat(file)).isFile()) throw new Error("Project snapshot must be a regular file.");
  const committed = await git(baseline, "show", `HEAD:${PROJECT_SNAPSHOT}`);
  if (await readFile(file, "utf8") !== committed) throw new Error("Project snapshot changed after baseline creation.");
  return projectConfigSchema.parse(await readJson(file));
}
