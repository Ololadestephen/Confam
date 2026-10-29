import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const MAX_SESSION_BYTES = 16 * 1024 * 1024;
export async function safeDirectory(directory: string) {
  const absolute = path.resolve(directory);
  if (/(?:^|\/)evals\/heldout(?:\/|$)/.test(absolute))
    throw new Error("Private held-out paths cannot be inspected.");
  let current = path.parse(absolute).root;
  for (const part of absolute
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Unsafe onboarding storage directory.");
  }
}
export async function boundedText(file: string, limit: number) {
  const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error("Expected a regular file without symlinks.");
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit)
      throw new Error("File exceeds the allowed size.");
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < buffer.length) {
      const read = await handle.read(buffer, size, buffer.length - size, size);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > limit) throw new Error("File exceeds the allowed size.");
    return buffer.subarray(0, size).toString("utf8");
  } finally {
    await handle.close();
  }
}
export class DraftStorage<T> {
  private readonly locks = new Map<string, Promise<unknown>>();
  constructor(
    readonly directory: string,
    private readonly schema: z.ZodType<T>,
  ) {}
  async locked<R>(id: string, work: () => Promise<R>): Promise<R> {
    z.uuid().parse(id);
    const previous = this.locks.get(id) ?? Promise.resolve();
    const result = previous
      .catch(() => undefined)
      .then(async () => {
        const folder = await this.folder(id);
        const lockFile = path.join(folder, "operation.lock");
        let lock;
        try {
          lock = await open(
            lockFile,
            constants.O_WRONLY |
              constants.O_CREAT |
              constants.O_EXCL |
              constants.O_NOFOLLOW,
            0o600,
          );
        } catch {
          throw new Error(
            "Draft is locked by another operation or an interrupted server. No retry was sent; start a new report if the previous server stopped.",
          );
        }
        try {
          return await work();
        } finally {
          await lock.close();
          await unlink(lockFile);
        }
      });
    this.locks.set(id, result);
    try {
      return await result;
    } finally {
      if (this.locks.get(id) === result) this.locks.delete(id);
    }
  }
  async folder(id: string) {
    z.uuid().parse(id);
    const folder = path.join(this.directory, id);
    await safeDirectory(folder);
    return folder;
  }
  async read(id: string) {
    const folder = await this.folder(id);
    let value: unknown;
    try {
      value = JSON.parse(
        await boundedText(path.join(folder, "session.json"), MAX_SESSION_BYTES),
      );
    } catch {
      throw new Error("Draft is unavailable or invalid.");
    }
    return this.schema.parse(value);
  }
  async write(id: string, value: T) {
    const checked = this.schema.parse(value);
    const folder = await this.folder(id);
    await writePrivate(
      path.join(folder, "session.json"),
      JSON.stringify(checked),
    );
  }
}
export async function writePrivate(file: string, text: string | Buffer) {
  if (Buffer.byteLength(text) > MAX_SESSION_BYTES)
    throw new Error("Draft is too large.");
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile(text);
    await handle.close();
    handle = undefined;
    await rename(temporary, file);
  } finally {
    await handle?.close();
    await unlink(temporary).catch(() => undefined);
  }
}
