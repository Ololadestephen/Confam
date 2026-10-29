import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rm } from "node:fs/promises";
import path from "node:path";

export type SnapshotManifest = {
  sha256: string;
  files: { path: string; sha256: string; bytes: number; mode: number }[];
  bytes: number;
};

const MAX_FILES = 2000;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_DEPTH = 20;
const OMIT_DIRS = new Set([
  "node_modules",
  ".git",
  "runs",
  ".desloppify",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
]);
const PRIVATE_FILES = new Set([
  "AGENTS.md",
  "RULES.md",
  "PLAN.md",
  "TASKS.md",
  "DESIGN.md",
  "CLAUDE.md",
  ".confam-project.json",
]);

async function checkAncestors(target: string): Promise<void> {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink())
      throw new Error(`Symbolic link in path: ${current}`);
    if (!stat.isDirectory()) throw new Error(`Not a directory: ${current}`);
  }
}

function privatePath(target: string): boolean {
  const parts = path.resolve(target).split(path.sep);
  return parts.some(
    (part, index) => part === "evals" && parts[index + 1] === "heldout",
  );
}

function excluded(name: string): boolean {
  return (
    name.startsWith(".env") ||
    PRIVATE_FILES.has(name) ||
    /\.(?:sqlite(?:3)?|db)(?:-(?:wal|shm))?$/.test(name)
  );
}

export async function captureProject(
  root: string,
  destination?: string,
): Promise<SnapshotManifest> {
  const source = path.resolve(root);
  const target =
    destination === undefined ? undefined : path.resolve(destination);
  if (privatePath(source) || (target && privatePath(target)))
    throw new Error("Private held-out path is not permitted");
  await checkAncestors(source);
  if (target) {
    const relative = path.relative(source, target);
    if (
      !relative ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    ) {
      throw new Error("Snapshot destination must be outside the project");
    }
    await checkAncestors(path.dirname(target));
    await mkdir(target, { mode: 0o700 });
  }
  const files: SnapshotManifest["files"] = [];
  let bytes = 0;
  async function walk(
    directory: string,
    relative: string,
    depth: number,
  ): Promise<void> {
    if (depth > MAX_DEPTH) throw new Error("Snapshot exceeds maximum depth");
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (
        excluded(entry.name) ||
        (path.basename(directory) === "evals" && entry.name === "heldout")
      )
        continue;
      if (entry.isDirectory() && OMIT_DIRS.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      const stat = await lstat(full);
      if (stat.isSymbolicLink())
        throw new Error(`Symbolic link in project: ${rel}`);
      if (stat.isDirectory()) {
        if (target) await mkdir(path.join(target, rel), { mode: 0o700 });
        await walk(full, rel, depth + 1);
        continue;
      }
      if (!stat.isFile()) throw new Error(`Non-regular project entry: ${rel}`);
      if (files.length >= MAX_FILES || stat.size > MAX_BYTES - bytes)
        throw new Error("Snapshot exceeds file or byte limit");
      const handle = await open(
        full,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      let content: Buffer;
      let mode: number;
      try {
        const opened = await handle.stat();
        if (
          !opened.isFile() ||
          opened.dev !== stat.dev ||
          opened.ino !== stat.ino ||
          opened.size > MAX_BYTES - bytes
        )
          throw new Error(`Project entry changed: ${rel}`);
        content = Buffer.alloc(opened.size);
        let offset = 0;
        while (offset < content.length) {
          const result = await handle.read(
            content,
            offset,
            content.length - offset,
            offset,
          );
          if (!result.bytesRead)
            throw new Error(`Project entry changed: ${rel}`);
          offset += result.bytesRead;
        }
        const after = await handle.stat();
        if (
          after.size !== opened.size ||
          after.mtimeMs !== opened.mtimeMs ||
          after.ctimeMs !== opened.ctimeMs
        )
          throw new Error(`Project entry changed: ${rel}`);
        mode = opened.mode & 0o111 ? 0o755 : 0o644;
      } finally {
        await handle.close();
      }
      if (target) {
        const output = await open(
          path.join(target, rel),
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          mode,
        );
        try {
          await output.writeFile(content);
          await output.chmod(mode);
        } finally {
          await output.close();
        }
      }
      bytes += content.length;
      files.push({
        path: rel,
        sha256: createHash("sha256").update(content).digest("hex"),
        bytes: content.length,
        mode,
      });
    }
  }
  try {
    await walk(source, "", 0);
    return {
      sha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
      files,
      bytes,
    };
  } catch (error) {
    if (target) await rm(target, { recursive: true, force: true });
    throw error;
  }
}
