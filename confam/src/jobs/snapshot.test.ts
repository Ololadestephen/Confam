import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { captureProject } from "./snapshot.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
async function fixture() {
  const dir = await mkdtemp("/private/tmp/confam-snapshot-");
  dirs.push(dir);
  const root = path.join(dir, "project");
  await mkdir(root);
  return { dir, root };
}

it("copies a deterministic manifest and binds helper and package changes", async () => {
  const { dir, root } = await fixture();
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "helper.js"), "helper");
  await writeFile(path.join(root, "package.json"), "{}");
  for (const name of [
    "AGENTS.md",
    ".env.local",
    ".confam-project.json",
    "state.sqlite-wal",
  ])
    await writeFile(path.join(root, name), "private");
  await mkdir(path.join(root, "evals", "heldout"), { recursive: true });
  await writeFile(path.join(root, "evals", "heldout", "secret"), "private");
  const dest = path.join(dir, "snapshot");
  const first = await captureProject(root, dest);
  expect(first.files.map((file) => file.path)).toEqual([
    "package.json",
    "src/helper.js",
  ]);
  expect(await captureProject(dest)).toEqual(first);
  expect(await readFile(path.join(dest, "src", "helper.js"), "utf8")).toBe(
    "helper",
  );
  await expect(captureProject(root, dest)).rejects.toThrow();
  await writeFile(path.join(root, "src", "helper.js"), "changed");
  expect((await captureProject(root)).sha256).not.toBe(first.sha256);
  await writeFile(path.join(root, "package.json"), "changed");
  expect((await captureProject(root)).sha256).not.toBe(first.sha256);
});

it("rejects links, nonregular files and oversized content", async () => {
  const { root } = await fixture();
  await symlink("missing", path.join(root, "link"));
  await expect(captureProject(root)).rejects.toThrow(/Symbolic link/);
  await rm(path.join(root, "link"));
  execFileSync("mkfifo", [path.join(root, "fifo")]);
  await expect(captureProject(root)).rejects.toThrow(/Non-regular/);
  await rm(path.join(root, "fifo"));
  await writeFile(path.join(root, "large"), Buffer.alloc(20 * 1024 * 1024 + 1));
  await expect(captureProject(root)).rejects.toThrow(/limit/);
});

it("rejects private paths and skips nested held-out directories without inspecting entries", async () => {
  const { dir, root } = await fixture();
  const heldout = path.join(root, "nested", "evals", "heldout");
  await mkdir(heldout, { recursive: true });
  await symlink("missing", path.join(heldout, "sentinel"));
  execFileSync("mkfifo", [path.join(heldout, "fifo")]);
  await writeFile(path.join(root, "public"), "visible");
  expect((await captureProject(root)).files.map((file) => file.path)).toEqual([
    "public",
  ]);
  await expect(
    captureProject(path.join(dir, "missing", "evals", "heldout", "project")),
  ).rejects.toThrow(/Private held-out/);
  await expect(
    captureProject(root, path.join(dir, "missing", "evals", "heldout", "copy")),
  ).rejects.toThrow(/Private held-out/);
});
