import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { confinedPath, loadProjectConfig, projectConfigSchema } from "./config.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
const config = {
  schemaVersion: 1, id: "example", root: "app", sourceFiles: ["main.js"], protectedPaths: [],
  runtime: { command: ["node", "main.js"], readinessPath: "/ready", portVariable: "PORT", dataVariable: "DATA", restart: false },
};

it.each(["../escape", "/absolute", "a/../escape", "a\\escape", "C:/escape", "a//b"])("rejects source escape %s", (file) => {
  expect(projectConfigSchema.safeParse({ ...config, sourceFiles: [file] }).success).toBe(false);
});
it.each(["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "npm-shrinkwrap.json", "tsconfig.json", "vite.config.ts", ".env", "tests/check.js", "checks/a.ts", "src/a.test.ts"])("protects infrastructure %s", (file) => {
  expect(projectConfigSchema.safeParse({ ...config, sourceFiles: [file] }).success).toBe(false);
});
it("rejects duplicate files and conflicting environment bindings", () => {
  expect(projectConfigSchema.safeParse({ ...config, sourceFiles: ["main.js", "main.js"] }).success).toBe(false);
  expect(projectConfigSchema.safeParse({ ...config, runtime: { ...config.runtime, dataVariable: "PORT" } }).success).toBe(false);
});
it("loads a project and refuses symlink source paths", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-project-"));
  directories.push(directory);
  await mkdir(path.join(directory, "app"));
  await writeFile(path.join(directory, "app/main.js"), "example");
  const configPath = path.join(directory, "project.json");
  await writeFile(configPath, JSON.stringify(config));
  const loaded = await loadProjectConfig(configPath);
  expect(loaded.config.runtime.readinessPath).toBe("/ready");
  await symlink("main.js", path.join(directory, "app/link.js"));
  await expect(confinedPath(loaded.root, "link.js")).rejects.toThrow("Symlink");
});

it("allows configuration at the repository root", () => {
  expect(projectConfigSchema.safeParse({ ...config, root: ".", runtime: { ...config.runtime, cwd: "." } }).success).toBe(true);
});
