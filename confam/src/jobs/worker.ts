import path from "node:path";
import { z } from "zod";
import { verifyProject } from "../project/verify.js";
import type { VerificationProgress } from "../project/progress.js";
import { JobStore } from "./store.js";
import { inputPaths, jsonInput, validateInputs } from "./inputs.js";
import { requestSchema } from "./state.js";

async function main() {
  const [folderValue, nonce, approval] = process.argv.slice(2);
  if (!folderValue || !nonce || !approval)
    throw new Error("Worker requires a concrete approved job.");
  const folder = path.resolve(folderValue);
  const id = z.uuid().parse(path.basename(folder));
  const store = new JobStore(path.dirname(folder));
  let job = await store.read(id);
  const lease = await store.lease();
  if (
    lease?.id !== id ||
    lease.nonce !== nonce ||
    job.preview.hash !== approval ||
    job.status !== "running"
  )
    throw new Error("Worker does not own this approval.");
  const abort = new AbortController();
  let reason: "cancelled" | "interrupted" | undefined;
  let verificationStarted = false;
  let finished = false;
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    queue = queue.then(work);
    queue.catch(() => undefined);
  };
  const cancel = (next: "cancelled" | "interrupted") => {
    if (finished || reason) return;
    reason = next;
    abort.abort();
    enqueue(async () => {
      job.status = "cancelling";
      job.phase = "cleaning-up";
      await store.write(job);
    });
  };
  process.on("message", (message) => {
    const action = (message as { action?: string })?.action;
    if (action === "cancel") cancel("cancelled");
    if (action === "shutdown") cancel("interrupted");
  });
  process.once("disconnect", () => cancel("interrupted"));
  process.once("SIGTERM", () => cancel("interrupted"));
  process.once("SIGINT", () => cancel("interrupted"));
  if (!process.connected) cancel("interrupted");
  await store.updateLease({ ...lease, workerPid: process.pid });
  const progress = (event: VerificationProgress) =>
    enqueue(async () => {
      if (event.reportPath) {
        const relative = path.relative(
          job.preview.runsDirectory,
          path.dirname(event.reportPath),
        );
        if (!/^verify-[a-zA-Z0-9-]+$/.test(relative))
          throw new Error("Report left the approved run library.");
        job.runId = relative;
      }
      job.phase = reason ? "cleaning-up" : event.phase;
      if (job.events.length < 1200)
        job.events.push({
          ...event,
          sequence: job.events.length,
          at: new Date().toISOString(),
        });
      await store.write(job);
    });
  try {
    const request = requestSchema.parse(
      await jsonInput(path.join(folder, "request.json")),
    );
    const files = await validateInputs(job, folder);
    const expected = inputPaths(folder);
    const confirmation = await jsonInput(files.confirmation);
    const expectedConfirmation =
      confirmation.source === "fixture" ? "fixture" : "developer-web";
    if (
      request.confirmation !== expectedConfirmation ||
      request.id !== id ||
      request.nonce !== nonce ||
      request.runsDirectory !== job.preview.runsDirectory ||
      request.project !== expected.project ||
      request.caseFile !== expected.caseFile ||
      request.workflow !== expected.workflow ||
      request.candidate !==
        (job.preview.candidate ? expected.candidate : undefined)
    )
      throw new Error("Worker request changed after approval.");
    verificationStarted = true;
    const result = await verifyProject({
      project: files.project,
      caseFile: files.caseFile,
      workflow: files.workflow,
      ...(job.preview.candidate ? { candidate: files.candidate } : {}),
      runsDirectory: request.runsDirectory,
      confirmation: request.confirmation,
      signal: abort.signal,
      onProgress: progress,
    });
    await queue;
    job.cleanupComplete = result.report.cleanupComplete;
    job.status =
      result.report.status === "cancelled"
        ? reason === "interrupted"
          ? "interrupted"
          : "cancelled"
        : result.report.status;
    job.verdict = result.report.verdict;
    job.error = result.report.error;
    if (!job.cleanupComplete) {
      job.status = "error";
      job.error =
        "Execution ended, but resource cleanup was not confirmed. Inspect the saved report before starting another run.";
      delete job.verdict;
    }
    if (["cancelled", "interrupted"].includes(job.status)) delete job.verdict;
  } catch (error) {
    await queue.catch(() => undefined);
    job.status =
      reason === "interrupted"
        ? "interrupted"
        : reason === "cancelled"
          ? "cancelled"
          : "error";
    job.error =
      error instanceof Error ? error.message : "Execution worker failed.";
    job.cleanupComplete = job.cleanupComplete ?? !verificationStarted;
    delete job.verdict;
  } finally {
    finished = true;
    job.finishedAt = new Date().toISOString();
    job.phase = job.cleanupComplete ? "finished" : "cleanup-unconfirmed";
    await store.write(job);
    // A failed cleanup keeps its lease so a second execution cannot overlap unknown resources.
    if (job.cleanupComplete) await store.release({ id, nonce });
    if (process.connected) process.disconnect?.();
  }
}
void main().catch(() => {
  process.exitCode = 1;
  if (process.connected) process.disconnect?.();
});
