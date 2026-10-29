import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { detectProject, type Detection } from "./detect.js";
import { projectConfigSchema } from "./config.js";
import { z } from "zod";

export interface RegisteredProject {
  id: string;
  root: string;
  name: string;
  detection: Detection;
  revision: string;
  approvedRevision?: string;
}

const maxSize = 1024 * 1024;
const locks = new Map<string, Promise<unknown>>();
const boundedString = z.string().max(8192);
const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const storedProjectSchema = z
  .strictObject({
    id: z.string().uuid(),
    root: z.string().min(1).max(8192).refine(path.isAbsolute),
    name: boundedString,
    revision: revisionSchema,
    approvedRevision: revisionSchema.optional(),
    detection: z.strictObject({
      name: boundedString,
      kind: boundedString,
      commands: z
        .array(
          z.strictObject({
            label: boundedString,
            command: z.array(boundedString).max(100),
            script: boundedString.optional(),
          }),
        )
        .max(100),
      issues: z.array(boundedString).max(100),
      configPath: z.string().max(8192).refine(path.isAbsolute).optional(),
      configuration: projectConfigSchema.optional(),
    }),
  })
  .superRefine((project, context) => {
    const parts = path.resolve(project.root).split(path.sep);
    if (
      parts.some((part, i) => part === "evals" && parts[i + 1] === "heldout")
    ) {
      context.addIssue({ code: "custom", message: "Private project root" });
    }
    if (project.detection.configPath) {
      const relative = path.relative(
        project.root,
        project.detection.configPath,
      );
      if (
        !relative ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        context.addIssue({
          code: "custom",
          message: "Configuration path outside project",
        });
      }
    }
  });

function rejectPrivate(value: string): void {
  const parts = path.resolve(value).split(path.sep);
  if (parts.some((part, i) => part === "evals" && parts[i + 1] === "heldout"))
    throw new Error("Private held-out paths cannot be inspected.");
}

async function guardDirectory(
  directory: string,
  create = false,
): Promise<void> {
  const absolute = path.resolve(directory);
  rejectPrivate(absolute);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error(`Unsafe directory: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !create)
        throw error;
      await mkdir(current, { mode: 0o700 });
    }
  }
}

async function readFile(
  file: string,
  limit: number,
): Promise<Buffer | undefined> {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit)
      throw new Error(`Unsafe or oversized file: ${file}`);
    const data = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(data, 0, data.length, 0);
    if (bytesRead > limit) throw new Error(`Oversized file: ${file}`);
    return data.subarray(0, bytesRead);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  } finally {
    await handle?.close();
  }
}

async function inspect(
  root: string,
): Promise<{ detection: Detection; revision: string }> {
  await guardDirectory(root);
  const detection = await detectProject(root);
  const hash = createHash("sha256").update(JSON.stringify({ root, detection }));
  for (const name of ["package.json", ".confam-project.json", "project.json"]) {
    hash.update(name);
    const data = await readFile(path.join(root, name), 128 * 1024);
    hash.update(data ? `present:${data.length}:` : "missing:");
    if (data) hash.update(data);
  }
  return { detection, revision: hash.digest("hex") };
}

export class ProjectRegistry {
  private readonly directory: string;
  private readonly file: string;
  constructor(storageDirectory: string) {
    this.directory = path.resolve(storageDirectory);
    rejectPrivate(this.directory);
    this.file = path.join(this.directory, "projects.json");
  }
  private async serialized<T>(operation: () => Promise<T>): Promise<T> {
    const previous = locks.get(this.file) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    locks.set(this.file, result);
    try {
      return await result;
    } finally {
      if (locks.get(this.file) === result) locks.delete(this.file);
    }
  }
  private async load(): Promise<RegisteredProject[]> {
    await guardDirectory(this.directory, true);
    const raw = await readFile(this.file, maxSize);
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new Error("Corrupt project registry.");
    }
    const validated = z.array(storedProjectSchema).max(100).safeParse(parsed);
    if (!validated.success) throw new Error("Corrupt project registry.");
    return validated.data;
  }
  private async save(projects: RegisteredProject[]): Promise<void> {
    if (!z.array(storedProjectSchema).max(100).safeParse(projects).success)
      throw new Error("Project setup exceeds registry limits or is invalid.");
    const data = Buffer.from(JSON.stringify(projects));
    if (data.length > maxSize)
      throw new Error("Project registry exceeds 1 MiB.");
    await guardDirectory(this.directory);
    // Reject an existing symlink even though rename itself would replace it.
    await readFile(this.file, maxSize);
    const temp = path.join(this.directory, `.projects-${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(
        temp,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      await handle.writeFile(data);
      await handle.close();
      handle = undefined;
      await rename(temp, this.file);
    } finally {
      await handle?.close();
      await unlink(temp).catch(() => undefined);
    }
  }
  list(): Promise<RegisteredProject[]> {
    return this.serialized(() => this.load());
  }
  add(root: string): Promise<RegisteredProject> {
    return this.serialized(async () => {
      if (!path.isAbsolute(root))
        throw new Error("Project root must be absolute.");
      root = path.resolve(root);
      rejectPrivate(root);
      const projects = await this.load();
      const existing = projects.find((item) => item.root === root);
      if (existing) return this.update(existing.id);
      if (projects.length >= 100) throw new Error("Project registry is full.");
      const { detection, revision } = await inspect(root);
      const project = {
        id: randomUUID(),
        root,
        name: detection.name,
        detection,
        revision,
      };
      projects.push(project);
      await this.save(projects);
      return project;
    });
  }
  refresh(id: string): Promise<RegisteredProject> {
    return this.serialized(() => this.update(id));
  }
  approve(id: string, revision: string): Promise<RegisteredProject> {
    return this.serialized(() => this.update(id, revision));
  }
  private async update(
    id: string,
    approved?: string,
  ): Promise<RegisteredProject> {
    const projects = await this.load();
    const index = projects.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Project not found.");
    const old = projects[index]!;
    const { detection, revision } = await inspect(old.root);
    const project: RegisteredProject = {
      id: old.id,
      root: old.root,
      name: detection.name,
      detection,
      revision,
    };
    if (old.approvedRevision === revision) project.approvedRevision = revision;
    if (approved === revision) project.approvedRevision = revision;
    projects[index] = project;
    await this.save(projects);
    if (approved !== undefined && approved !== revision)
      throw new Error(
        "Project setup changed; review the refreshed setup before approving.",
      );
    return project;
  }
}
