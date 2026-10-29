import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { loadProjectConfig, type ProjectConfig } from "./config.js";

export interface Detection {
  name: string;
  kind: string;
  commands: Array<{ label: string; command: string[]; script?: string }>;
  configuration?: ProjectConfig;
  configPath?: string;
  issues: string[];
}

const limit = 128 * 1024;
const limitations = [
  "Suggested commands are unverified and do not authorize execution.",
  "Dependencies may require installation; build and environment requirements have not been checked.",
];

function privatePath(root: string): boolean {
  const parts = path.resolve(root).split(path.sep);
  return parts.some(
    (part, index) => part === "evals" && parts[index + 1] === "heldout",
  );
}

async function readBounded(file: string): Promise<string | undefined> {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("Not a regular file");
    if (stat.size > limit) throw new Error("File exceeds 128 KiB");
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new Error("File exceeds 128 KiB");
    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function detectProject(root: string): Promise<Detection> {
  const absolute = path.resolve(root);
  const result: Detection = {
    name: path.basename(absolute),
    kind: "Unsupported",
    commands: [],
    issues: [],
  };
  if (privatePath(absolute))
    throw new Error("Private held-out paths cannot be inspected.");
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw new Error("Project root must be a non-symlink directory.");
  const resolved = await realpath(absolute);
  if (privatePath(resolved))
    throw new Error("Private held-out paths cannot be inspected.");

  const configs: string[] = [];
  for (const name of [".confam-project.json", "project.json"]) {
    const file = path.join(resolved, name);
    try {
      if ((await readBounded(file)) !== undefined) configs.push(file);
    } catch {
      result.issues.push(
        `Cannot safely read ${name}; configuration was not loaded.`,
      );
      return result;
    }
  }
  if (configs.length > 1) {
    result.issues.push(
      "Multiple project configurations found; choose one before proceeding.",
    );
    return result;
  }
  if (configs.length === 1) {
    const configPath = configs[0]!;
    try {
      const raw = JSON.parse((await readBounded(configPath))!);
      if (
        typeof raw?.root === "string" &&
        privatePath(path.resolve(resolved, raw.root))
      ) {
        throw new Error("Private held-out project root.");
      }
      if (typeof raw?.root === "string") {
        const projectRoot = path.resolve(resolved, raw.root);
        const paths = [
          ...(Array.isArray(raw.sourceFiles) ? raw.sourceFiles : []),
          raw.runtime?.cwd,
        ];
        if (
          paths.some(
            (entry) =>
              typeof entry === "string" &&
              privatePath(path.resolve(projectRoot, entry)),
          )
        ) {
          throw new Error("Private held-out configuration path.");
        }
      }
      const loaded = await loadProjectConfig(configPath);
      return {
        name: loaded.config.id,
        kind: "Confam project",
        commands: [
          {
            label: "Configured runtime",
            command: loaded.config.runtime.command,
          },
        ],
        configPath,
        configuration: loaded.config,
        issues: [...limitations],
      };
    } catch {
      result.issues.push(
        "Project configuration is invalid or inaccessible; it was not loaded.",
      );
      return result;
    }
  }
  let manifest: unknown;
  try {
    const contents = await readBounded(path.join(resolved, "package.json"));
    if (contents === undefined) {
      result.issues.push(
        "No package.json or Confam project configuration found.",
      );
      return result;
    }
    manifest = JSON.parse(contents);
  } catch {
    result.issues.push(
      "package.json is malformed, inaccessible, or exceeds 128 KiB.",
    );
    return result;
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    result.issues.push("package.json must contain an object.");
    return result;
  }
  const pkg = manifest as Record<string, unknown>;
  if (typeof pkg.name === "string" && pkg.name.trim()) {
    result.name = pkg.name.slice(0, 200);
    if (pkg.name.length > 200)
      result.issues.push("Package name was truncated to 200 characters.");
  }
  const scripts =
    pkg.scripts &&
    typeof pkg.scripts === "object" &&
    !Array.isArray(pkg.scripts)
      ? (pkg.scripts as Record<string, unknown>)
      : {};
  const deps = [pkg.dependencies, pkg.devDependencies].filter(
    (value): value is Record<string, unknown> =>
      !!value && typeof value === "object" && !Array.isArray(value),
  );
  const has = (name: string) =>
    deps.some((dependency) => Object.hasOwn(dependency, name));
  const next = has("next");
  const vite = has("vite");
  if (next && vite)
    result.issues.push(
      "Both Next.js and Vite are listed; framework detection is ambiguous.",
    );
  result.kind =
    next && vite
      ? "Ambiguous Node project"
      : next
        ? "Next.js"
        : vite
          ? "Vite"
          : "Node.js";
  for (const script of ["dev", "start"]) {
    if (typeof scripts[script] === "string" && scripts[script].trim())
      result.commands.push({
        label: `npm run ${script}`,
        command: ["npm", "run", script],
        script: scripts[script] as string,
      });
  }
  if (result.commands.length > 1)
    result.issues.push(
      "Both dev and start scripts are available; choose the intended command.",
    );
  for (const hook of ["predev", "postdev", "prestart", "poststart"]) {
    if (typeof scripts[hook] === "string" && scripts[hook].trim())
      result.issues.push(`${hook} lifecycle script: ${scripts[hook]}`);
  }
  if (!result.commands.length)
    result.issues.push(
      "No dev or start script found; a runtime command must be configured.",
    );
  result.issues.push(...limitations);
  return result;
}
