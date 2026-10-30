import { cp, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { git } from "./process.js";

import { confinedPath, isProtectedPath, projectConfigSchema, type ProjectConfig } from "../project/config.js";
import { legacyProjectConfig } from "../project/legacy.js";
import { PROJECT_SNAPSHOT, readProjectSnapshot } from "../project/snapshot.js";

export interface GuardOptions {
  // Lets git ignore hunk line counts, for checking model-written diffs before normalization.
  recount?: boolean;
}

export async function guardPatch(repository: string, patch: string, options?: GuardOptions): Promise<void> {
  const config = await readProjectSnapshot(repository);
  const allowedFiles = new Set(config.sourceFiles);
  const summary = await git(repository, "apply", "--numstat", "-z", ...(options?.recount ? ["--recount"] : []), patch);
  const paths = summary.split("\0").filter(Boolean).map((entry) => entry.split("\t").slice(2).join("\t"));
  if (paths.length === 0) throw new Error("Patch has no file changes.");
  for (const file of paths) {
    if (!allowedFiles.has(file) || isProtectedPath(file, config.protectedPaths)) throw new Error(`Patch touches a protected or unsupported path: ${file}`);
    if (!(await lstat(await confinedPath(repository, file))).isFile()) throw new Error(`Patch target must be regular: ${file}`);
  }
  const contents = await readFile(patch, "utf8");
  if (/^(?:new file mode|deleted file mode|old mode|new mode) /m.test(contents)) {
    throw new Error("Patch changes file modes; only regular app content changes are allowed.");
  }
}

export async function prepareBaseline(app: string, directory: string, project?: ProjectConfig): Promise<string> {
  const config = projectConfigSchema.parse(project ?? await legacyProjectConfig());
  const baseline = path.join(directory, "baseline");
  await mkdir(baseline, { recursive: true });
  await cp(app, baseline, {
    recursive: true,
    filter: (file) => {
      const relative = path.relative(app, file);
      return !relative.split(path.sep).some((part) => ["node_modules", ".git", "runs", ".desloppify"].includes(part) || part.startsWith(".env"))
        && !/\.(?:sqlite(?:3)?|db)(?:-(?:wal|shm))?$/.test(file);
    },
  });
  await writeFile(path.join(baseline, PROJECT_SNAPSHOT), JSON.stringify(config, null, 2) + "\n", { flag: "wx" });
  await git(baseline, "init", "-q");
  await git(baseline, "add", "--", ".");
  // This is a disposable specimen repository under runs/, never the owner's repository.
  await git(baseline, "-c", "commit.gpgsign=false", "-c", "user.name=Confam", "-c", "user.email=local@confam.invalid",
    "commit", "-qm", "Specimen baseline");
  return baseline;
}

export async function createVariant(baseline: string, directory: string, patch?: string): Promise<void> {
  if (patch) await guardPatch(baseline, patch);
  await git(baseline, "worktree", "add", "--detach", directory, "HEAD");
  if (patch) await git(directory, "apply", "--", patch);
  const config = await readProjectSnapshot(baseline);
  for (const file of config.sourceFiles) {
    const entry = await lstat(await confinedPath(directory, file));
    if (!entry.isFile()) throw new Error(`Variant app file is not regular: ${file}`);
  }
}
