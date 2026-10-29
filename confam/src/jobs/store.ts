import path from "node:path";
import { open, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { z } from "zod";
import {
  boundedText,
  safeDirectory,
  writePrivate,
} from "../onboarding/storage.js";
import { jobSchema, leaseSchema, type Lease } from "./state.js";
import type { ExecutionJob } from "./contracts.js";
export class JobStore {
  constructor(readonly directory: string) {}
  async folder(id: string) {
    z.uuid().parse(id);
    const folder = path.join(this.directory, id);
    await safeDirectory(folder);
    return folder;
  }
  async read(id: string): Promise<ExecutionJob> {
    let raw: unknown;
    try {
      raw = JSON.parse(
        await boundedText(
          path.join(await this.folder(id), "job.json"),
          3 * 1024 * 1024,
        ),
      );
    } catch {
      throw new Error("Execution job is unavailable.");
    }
    return jobSchema.parse(raw);
  }
  async write(job: ExecutionJob) {
    await writePrivate(
      path.join(await this.folder(job.id), "job.json"),
      JSON.stringify(jobSchema.parse(job)),
    );
  }
  async lease() {
    await safeDirectory(this.directory);
    try {
      const text = await boundedText(
        path.join(this.directory, "active.lock"),
        4096,
      );
      return leaseSchema.parse(JSON.parse(text));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error(
        "Execution lock is invalid; automatic execution is blocked.",
      );
    }
  }
  async acquire(value: Lease) {
    await safeDirectory(this.directory);
    const file = path.join(this.directory, "active.lock");
    let handle;
    try {
      handle = await open(
        file,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      await handle.writeFile(JSON.stringify(leaseSchema.parse(value)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new Error(
          "Another verification is active or requires cleanup. Only one job can run at a time.",
        );
      throw error;
    } finally {
      await handle?.close();
    }
  }
  async updateLease(value: Lease) {
    const current = await this.lease();
    if (current?.nonce !== value.nonce || current.id !== value.id)
      throw new Error("Execution ownership changed.");
    await writePrivate(
      path.join(this.directory, "active.lock"),
      JSON.stringify(value),
    );
  }
  async release(value: Pick<Lease, "id" | "nonce">) {
    const current = await this.lease();
    if (current?.id === value.id && current.nonce === value.nonce)
      await unlink(path.join(this.directory, "active.lock"));
  }
}
export function processExists(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}
