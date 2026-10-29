import { createHash } from "node:crypto";
import { lstat, realpath, readFile } from "node:fs/promises";
import path from "node:path";
import { confinedPath } from "../project/config.js";

export interface Artifact { id: string; label: string; kind: string; url: string; file: string; }
const types: Record<string, string> = { ".webm": "video", ".mp4": "video", ".zip": "trace", ".patch": "patch", ".log": "log", ".json": "json", ".md": "text" };
export class ArtifactRegistry {
  readonly entries = new Map<string, Artifact>();
  constructor(readonly root: string, readonly token: string) { }
  async add(file: unknown, label?: string): Promise<{ url: string; label: string } | undefined> {
    if (typeof file !== "string") return undefined;
    const target = path.isAbsolute(file) ? file : path.resolve(this.root, file);
    const relative = path.relative(this.root, target);
    if (relative.split(path.sep).some((part) => [".git", "baseline", "app", "data"].includes(part) || part.startsWith(".env"))) return undefined;
    const kind = types[path.extname(target)];
    if (!kind) return undefined;
    try {
      const confined = await confinedPath(this.root, relative);
      if (!(await lstat(confined)).isFile()) return undefined;
      const id = createHash("sha256").update(relative).digest("hex");
      const artifact = { id, label: label ?? path.basename(target), kind, url: `/api/artifacts/${id}?token=${this.token}`, file: confined };
      this.entries.set(id, artifact);
      return { url: artifact.url, label: artifact.label };
    } catch { return undefined; }
  }
  async resolve(id: string): Promise<Artifact> {
    const artifact = this.entries.get(id);
    if (!artifact) throw new Error("Artifact is not declared by this run.");
    const file = await confinedPath(this.root, path.relative(this.root, artifact.file));
    if (await realpath(file) !== artifact.file || !(await lstat(file)).isFile()) throw new Error("Artifact changed after registration.");
    return artifact;
  }
}
export async function boundedJson(file: string): Promise<unknown> {
  const entry = await lstat(file);
  if (!entry.isFile() || entry.size > 8 * 1024 * 1024) throw new Error("Run metadata must be a bounded regular file.");
  const text = await readFile(file, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Run metadata is incomplete or invalid JSON.");
  }
}
export function redact(value: unknown, personal = false): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item, personal));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /(?:authorization|password|secret|api.?key|access.?token|cookie|bearer|session.?id)/i.test(key) ? "[redacted]" : redact(item, personal)]));
  if (typeof value !== "string") return value;
  let text = value.replace(/\bBearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|api)[-_][A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .replace(/\b([A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD))\s*=\s*[^\s]+/gi, "$1=[redacted]")
    .replace(/([?&](?:token|api_key|access_token|key)=)[^&#\s]+/gi, "$1[redacted]");
  if (personal) text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]").replace(/\+?\d[\d ()-]{8,}\d/g, "[redacted number]");
  return text;
}
