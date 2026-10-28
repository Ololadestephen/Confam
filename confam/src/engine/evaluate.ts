import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { BookingSubject, VariantResult, VariantSpec } from "./contracts.js";
import { classifyVariant } from "./classifier.js";
import { verifyChecks, type FrozenChecks } from "./freeze.js";
import { errorMessage } from "./process.js";
import { runBrowserChecks } from "./runner.js";
import type { OracleProbe } from "./salon.js";
import { readProjectSnapshot } from "../project/snapshot.js";
import { startServer } from "./server.js";
import { createVariant, guardPatch } from "./variants.js";

interface EvaluationContext {
  baseline: string;
  runDirectory: string;
  checks: FrozenChecks;
  subject: BookingSubject;
  probes: Record<string, OracleProbe>;
}

async function withOracleDeadline<T>(execute: () => Promise<T>, cancel: () => Promise<void>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const operation = execute();
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { expired = true; reject(new Error("Oracle execution exceeded 10 seconds.")); }, 10_000);
      }),
    ]);
  } catch (error) {
    if (expired) {
      // Kill the server to release any probe fetch; abort any pending restart.
      // Wait for that operation to settle so it cannot create a server after cleanup.
      await cancel();
      await operation.catch(() => undefined);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function evaluateVariant(spec: VariantSpec, run: EvaluationContext): Promise<VariantResult> {
  await verifyChecks(run.checks);
  const directory = path.join(run.runDirectory, "variants", spec.id);
  await mkdir(directory, { recursive: true });
  const result: VariantResult = { id: spec.id, kind: spec.kind, violation: spec.violation, patchSource: spec.patchSource, requirements: spec.requirements, outcome: "invalid", probes: {} };
  const app = path.join(directory, "app");
  const dataDirectory = path.join(directory, "data");
  const dbPath = path.join(dataDirectory, "state");
  const logPath = path.join(directory, "server.log");
  if (spec.kind === "candidate" && spec.patch) {
    try { await guardPatch(run.baseline, spec.patch); }
    catch (error) { return { ...result, outcome: "rejected", error: errorMessage(error) }; }
  }
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  const oracleAbort = new AbortController();
  let phase: "prepare" | "checks" | "oracle" = "prepare";
  try {
    const project = await readProjectSnapshot(run.baseline);
    await createVariant(run.baseline, app, spec.patch);
    await verifyChecks(run.checks);
    await mkdir(dataDirectory, { recursive: true });
    server = await startServer(app, dbPath, logPath, undefined, project.runtime);
    phase = "checks";
    const restartApp = async () => {
      if (!project.runtime.restart) throw new Error("Project does not support restart.");
      oracleAbort.signal.throwIfAborted();
      await verifyChecks(run.checks);
      await server?.stop();
      server = await startServer(app, dbPath, logPath, oracleAbort.signal, project.runtime);
      return server.baseUrl;
    };
    result.checks = await runBrowserChecks(run.checks, server.baseUrl, path.join(directory, "evidence"), {
      restartApp,
      async cancel() {
        oracleAbort.abort();
        await server?.stop();
      },
    });
    if (result.checks.reached && (result.checks.status === "passed" || result.checks.status === "assertion-failed")) {
      phase = "oracle";
      const probeIds = spec.kind === "development" || spec.kind === "held-out" ? spec.requirements.map(({ probe }) => probe) : Object.keys(run.probes);
      const oracleContext = {
        dbPath,
        get baseUrl() { if (!server) throw new Error("Oracle server is unavailable."); return server.baseUrl; },
        async restartApp() {
          await restartApp();
        },
      };
      for (const id of new Set(probeIds)) {
        await verifyChecks(run.checks);
        const probe = run.probes[id];
        if (!probe) throw new Error(`Unknown oracle probe: ${id}`);
        result.probes[id] = await withOracleDeadline(() => probe.run(oracleContext, run.subject), async () => {
          oracleAbort.abort();
          await server?.stop();
        });
      }
    }
    result.outcome = classifyVariant(spec, result.checks, result.probes);
    if ((spec.kind === "development" || spec.kind === "held-out") && spec.serverErrorIncludes) {
      await server.stop();
      const log = await readFile(logPath, "utf8");
      const requiredError = spec.serverErrorIncludes;
      result.serverErrors = log.split("\n").filter((line) => line.includes(requiredError));
      if (result.serverErrors.length === 0 && (result.outcome === "caught" || result.outcome === "survived")) result.outcome = "unconfirmed";
    }
  } catch (error) {
    result.outcome = phase === "prepare" ? "invalid" : "execution-error";
    result.error = errorMessage(error);
  } finally {
    await server?.stop();
  }
  return result;
}
