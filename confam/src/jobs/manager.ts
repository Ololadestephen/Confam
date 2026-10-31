import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { OnboardingService } from "../onboarding/service.js";
import { safeDirectory, writePrivate } from "../onboarding/storage.js";
import { hash as confirmationHash } from "../onboarding/context.js";
import { captureProject } from "./snapshot.js";
import { JobStore, processExists } from "./store.js";
import {
  inputPaths,
  previewHash,
  saveJson,
  sha256,
  stableHash,
  toolIdentity,
  validateInputs,
} from "./inputs.js";
import { requestSchema, type Lease } from "./state.js";
import type { ExecutionJob } from "./contracts.js";
const candidateSchema = z.strictObject({
  name: z.string().min(1).max(200),
  text: z
    .string()
    .min(1)
    .max(1024 * 1024),
});
const activeStatuses = new Set(["running", "cancelling"]);
export class ExecutionManager {
  readonly store: JobStore;
  private readonly children = new Map<string, ChildProcess>();
  private readonly completions = new Map<string, Promise<void>>();
  private closed = false;
  constructor(
    private readonly onboarding: OnboardingService,
    directory: string,
    private readonly runsDirectory: string,
    private readonly enabled = true,
  ) {
    this.store = new JobStore(directory);
  }
  async prepare(draftId: string, candidateInput?: unknown) {
    if (this.closed || !this.enabled)
      throw new Error(
        "Open Confam with a run library directory to start verification.",
      );
    const inputs = await this.onboarding.executionInputs(draftId);
    const candidate =
      candidateInput === undefined
        ? undefined
        : candidateSchema.parse(candidateInput);
    if (candidate && Buffer.byteLength(candidate.text) > 1024 * 1024)
      throw new Error("Candidate patch exceeds 1MiB.");
    const id = randomUUID();
    const folder = await this.store.folder(id);
    const files = inputPaths(folder);
    await safeDirectory(files.directory);
    const manifest = await captureProject(inputs.root, files.app);
    const configuration = { ...inputs.configuration, root: "app" };
    const job: ExecutionJob = {
      id,
      draftId,
      status: "ready",
      createdAt: new Date().toISOString(),
      events: [],
      preview: {
        hash: "",
        toolHash: await toolIdentity(),
        runsDirectory: this.runsDirectory,
        projectName: inputs.projectName,
        caseId: inputs.definition.id,
        root: inputs.root,
        command: inputs.configuration.runtime.command,
        manifest,
        configuration,
        definition: inputs.definition,
        workflow: inputs.workflow,
        report: inputs.report,
        confirmationHash: confirmationHash(inputs.confirmation),
        ...(inputs.recording
          ? {
              recording: {
                sha256: sha256(inputs.recording),
                bytes: inputs.recording.length,
              },
            }
          : {}),
        ...(candidate
          ? {
              candidate: {
                ...candidate,
                sha256: sha256(candidate.text),
                bytes: Buffer.byteLength(candidate.text),
              },
            }
          : {}),
        limitations: [
          "Runs trusted local application code; local processes are not a hostile-code sandbox.",
          "State is isolated per variant; dependencies must already be supported. No install or build hooks run.",
          "Evidence applies to the reviewed expectations and workflow only. No model calls occur during execution.",
        ],
      },
    };
    job.preview.hash = previewHash(job.preview);
    await saveJson(files.project, configuration);
    await saveJson(files.caseFile, inputs.definition);
    await saveJson(files.workflow, inputs.workflow);
    await saveJson(files.confirmation, inputs.confirmation);
    await writePrivate(files.report, inputs.report);
    if (candidate) await writePrivate(files.candidate, candidate.text);
    if (inputs.recording) await writePrivate(files.recording, inputs.recording);
    await this.store.write(job);
    return job;
  }
  async get(id: string) {
    // The worker writes its terminal result before releasing the lease, so read the lease first: a job that is
    // still active after its lease is gone really was abandoned, not just finishing between the two reads.
    const lease = await this.store.lease();
    const job = await this.store.read(id);
    if (activeStatuses.has(job.status)) {
      if (
        !lease ||
        lease.id !== id ||
        !processExists(lease.workerPid ?? lease.managerPid)
      ) {
        job.status = "interrupted";
        job.finishedAt = new Date().toISOString();
        job.cleanupComplete = false;
        job.error =
          "The execution owner stopped before a terminal result. No automatic restart occurred; cleanup is unconfirmed.";
        delete job.verdict;
        await this.store.write(job);
      }
    }
    return job;
  }
  async list(draftId: string) {
    z.uuid().parse(draftId);
    await safeDirectory(this.store.directory);
    const entries = (
      await readdir(this.store.directory, { withFileTypes: true })
    )
      .filter(
        (entry) =>
          entry.isDirectory() && z.uuid().safeParse(entry.name).success,
      )
      .slice(-200);
    const jobs = [];
    for (const entry of entries) {
      try {
        const job = await this.get(entry.name);
        if (job.draftId === draftId) jobs.push(job);
      } catch {
        /* Incomplete preparations are not executable jobs. */
      }
    }
    return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async start(id: string, digest: string) {
    if (this.closed || !this.enabled)
      throw new Error("Execution is unavailable on this server.");
    const job = await this.get(id);
    if (job.preview.runsDirectory !== this.runsDirectory)
      throw new Error("This job belongs to another run library.");
    if (job.status !== "ready" || job.preview.hash !== digest)
      throw new Error(
        "Review the current execution preview. A start approval can be used only once.",
      );
    const nonce = randomBytes(32).toString("hex");
    const lease: Lease = { id, nonce, managerPid: process.pid };
    await this.store.acquire(lease);
    let child: ChildProcess | undefined;
    try {
      // Re-read after the global lock: concurrent starts cannot consume one approval twice.
      const locked = await this.store.read(id);
      if (locked.status !== "ready" || locked.preview.hash !== digest)
        throw new Error("Execution approval was already consumed.");
      const current = await this.onboarding.executionInputs(job.draftId);
      if (
        current.root !== job.preview.root ||
        (await captureProject(current.root)).sha256 !==
          job.preview.manifest.sha256 ||
        stableHash(current.definition) !== stableHash(job.preview.definition) ||
        stableHash(current.workflow) !== stableHash(job.preview.workflow) ||
        confirmationHash(current.confirmation) !==
          job.preview.confirmationHash ||
        current.report !== job.preview.report
      )
        throw new Error(
          "Approved project or confirmed draft changed. Prepare a new execution preview.",
        );
      const folder = await this.store.folder(id);
      const files = await validateInputs(job, folder);
      const request = requestSchema.parse({
        id,
        nonce,
        runsDirectory: this.runsDirectory,
        project: files.project,
        caseFile: files.caseFile,
        workflow: files.workflow,
        ...(job.preview.candidate ? { candidate: files.candidate } : {}),
        confirmation: current.mode === "fixture" ? "fixture" : "developer-web",
      });
      await saveJson(path.join(folder, "request.json"), request);
      job.status = "running";
      job.phase = "queued";
      job.startedAt = new Date().toISOString();
      await this.store.write(job);
      child = spawn(
        process.execPath,
        [
          "--import",
          import.meta.resolve("tsx"),
          fileURLToPath(new URL("worker.ts", import.meta.url)),
          folder,
          nonce,
          digest,
        ],
        {
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          env: { PATH: process.env.PATH },
          detached: false,
        },
      );
      this.children.set(id, child);
      const running = child;
      const completion = new Promise<void>((resolve) => {
        let finished = false;
        const finalize = async (error?: Error) => {
          if (finished) return;
          finished = true;
          try {
            const saved = await this.store.read(id);
            if (activeStatuses.has(saved.status)) {
              saved.status = "interrupted";
              saved.finishedAt = new Date().toISOString();
              saved.error = error
                ? "Execution worker could not start."
                : "Execution worker stopped before recording a terminal result.";
              saved.cleanupComplete = false;
              delete saved.verdict;
              await this.store.write(saved);
            }
            if (saved.cleanupComplete || !running.pid)
              await this.store.release(lease);
          } finally {
            this.children.delete(id);
            this.completions.delete(id);
            resolve();
          }
        };
        running.once("error", (error) => {
          if (!running.pid) void finalize(error).catch(() => undefined);
        });
        running.once("exit", () => {
          void finalize().catch(() => undefined);
        });
      });
      this.completions.set(id, completion);
      return job;
    } catch (error) {
      if (!child) await this.store.release(lease);
      throw error;
    }
  }
  async cancel(id: string) {
    const job = await this.get(id);
    if (!activeStatuses.has(job.status)) return job;
    const child = this.children.get(id);
    if (!child?.connected)
      throw new Error(
        "This server does not own the active worker. Cancellation must use its original server; no unrelated process was signalled.",
      );
    child.send({ action: "cancel" });
    for (let attempt = 0; attempt < 100; attempt++) {
      await delay(25);
      const updated = await this.store.read(id);
      if (updated.status !== "running") return updated;
    }
    throw new Error("Cancellation was requested; cleanup is still pending.");
  }
  async close() {
    this.closed = true;
    for (const child of this.children.values())
      if (child.connected) child.send({ action: "shutdown" });
    await Promise.all([...this.completions.values()]);
  }
}
