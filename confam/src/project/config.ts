import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readJson } from "../engine/json.js";

// Configuration is reviewed executable authority, never a model-authored patch target.
export const relativePathSchema = z.string().min(1).refine((value) =>
  !path.posix.isAbsolute(value) && !path.win32.isAbsolute(value)
  && !value.includes("\\") && !value.includes("\0")
  && value.split("/").every((part) => part !== ".." && part !== "" && part !== "."),
  "Expected a confined, normalized relative path.");
const directoryPathSchema = z.union([relativePathSchema, z.literal(".")]);
const commandSchema = z.array(z.string().min(1).refine((value) => !value.includes("\0"))).min(1).max(64);
const variableName = z.string().regex(/^[A-Z_][A-Z0-9_]*$/);
export const projectConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  root: directoryPathSchema,
  sourceFiles: z.array(relativePathSchema).min(1),
  protectedPaths: z.array(relativePathSchema).default([]),
  runtime: z.strictObject({
    command: commandSchema,
    cwd: directoryPathSchema.optional(),
    readinessPath: z.string().regex(/^\/(?!\/)[^?#]*$/),
    timeoutMs: z.number().int().min(100).max(120000).default(10000),
    portVariable: variableName,
    dataVariable: variableName,
    restart: z.boolean(),
  }),
}).superRefine((config, context) => {
  if (new Set(config.sourceFiles).size !== config.sourceFiles.length) {
    context.addIssue({ code: "custom", message: "Duplicate source paths." });
  }
  if ([config.runtime.portVariable, config.runtime.dataVariable].some((name) =>
    ["PATH", "HOME", "NODE_OPTIONS", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "MODEL_API_KEY"].includes(name))) {
    context.addIssue({ code: "custom", message: "Runtime bindings cannot replace protected environment variables." });
  }
  if (config.runtime.portVariable === config.runtime.dataVariable) {
    context.addIssue({ code: "custom", message: "Port and data environment variables must differ." });
  }
  for (const file of config.sourceFiles) {
    if (isProtectedPath(file, config.protectedPaths)) {
      context.addIssue({ code: "custom", message: `Source path is protected: ${file}` });
    }
  }
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type ProjectRuntime = ProjectConfig["runtime"];

const protectedBasenames = new Set([
  ".confam-project.json", "project.json", "package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb",
  "deno.json", "deno.jsonc", "deno.lock", "tsconfig.json", "jsconfig.json",
  "pyproject.toml", "poetry.lock", "uv.lock", "Pipfile", "Pipfile.lock",
  "Cargo.toml", "Cargo.lock", "go.mod", "go.sum", "Gemfile", "Gemfile.lock",
]);

export function isProtectedPath(file: string, protectedPaths: string[]): boolean {
  const parts = file.split("/");
  return parts.some((part) => [".git", "node_modules", "checks", "probes", "tests", "__tests__"].includes(part)
    || part.startsWith(".env"))
    || parts.some((part) => protectedBasenames.has(part) || /^(?:requirements.*\.txt|(?:vite|vitest|webpack|rollup)\.config\.[^/]+|tsconfig\.[^/]+\.json)$/.test(part))
    || /(?:^|\/).*\.(?:test|spec)\.[^/]+$/.test(file)
    || protectedPaths.some((protectedPath) => file === protectedPath || file.startsWith(`${protectedPath}/`));
}

export async function confinedPath(root: string, relative: string): Promise<string> {
  directoryPathSchema.parse(relative);
  const resolvedRoot = await realpath(root);
  let current = resolvedRoot;
  for (const part of relative === "." ? [] : relative.split("/")) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink paths are unsupported: ${relative}`);
  }
  const resolved = await realpath(current);
  const remainder = path.relative(resolvedRoot, resolved);
  if (remainder.startsWith(`..${path.sep}`) || remainder === ".." || path.isAbsolute(remainder)) {
    throw new Error("Project path escapes its approved root.");
  }
  return resolved;
}

export async function loadProjectConfig(configPath: string): Promise<{ config: ProjectConfig; root: string; }> {
  if (!(await lstat(configPath)).isFile()) throw new Error("Project configuration must be a regular file.");
  const config = projectConfigSchema.parse(await readJson<unknown>(configPath));
  return resolveProjectConfig(configPath, config);
}

export async function resolveProjectConfig(configPath: string, config: ProjectConfig): Promise<{ config: ProjectConfig; root: string }> {
  const root = await confinedPath(path.dirname(configPath), config.root);
  if (!(await lstat(root)).isDirectory()) throw new Error("Project root must be a directory.");
  for (const file of config.sourceFiles) {
    if (!(await lstat(await confinedPath(root, file))).isFile()) throw new Error(`Source is not a regular file: ${file}`);
  }
  if (config.runtime.cwd && !(await lstat(await confinedPath(root, config.runtime.cwd))).isDirectory()) {
    throw new Error("Runtime working directory must be a directory.");
  }
  return { config, root };
}
