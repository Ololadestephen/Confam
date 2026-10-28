import { cp, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { git } from "./process.js";

// Candidate patches may change app behavior, never dependencies, tests, or infrastructure.
const PATCHABLE_FILES = new Set(["server.js", "db.js", "public/app.js", "public/index.html", "public/styles.css"]);

export async function guardPatch(repository: string, patch: string): Promise<void> {
  const summary = await git(repository, "apply", "--numstat", "-z", patch);
  const paths = summary.split("\0").filter(Boolean).map((entry) => entry.split("\t").slice(2).join("\t"));
  if (paths.length === 0) throw new Error("Patch has no file changes.");
  for (const file of paths) {
    if (!PATCHABLE_FILES.has(file)) throw new Error(`Patch touches a protected or unsupported path: ${file}`);
  }
  const contents = await readFile(patch, "utf8");
  if (/^(?:new file mode|old mode|new mode) /m.test(contents)) {
    throw new Error("Patch changes file modes; only regular app content changes are allowed.");
  }
}

export async function prepareBaseline(app: string, directory: string): Promise<string> {
  const baseline = path.join(directory, "baseline");
  await mkdir(baseline, { recursive: true });
  await cp(app, baseline, {
    recursive: true,
    filter: (file) => {
      const relative = path.relative(app, file);
      return !relative.split(path.sep).some((part) => ["node_modules", ".git", "tests"].includes(part))
        && !/\.(?:sqlite(?:3)?|db)(?:-(?:wal|shm))?$/.test(file);
    },
  });
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
  for (const file of PATCHABLE_FILES) {
    const entry = await lstat(path.join(directory, file));
    if (!entry.isFile()) throw new Error(`Variant app file is not regular: ${file}`);
  }
}
