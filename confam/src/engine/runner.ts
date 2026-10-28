import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Video } from "@playwright/test";
import type { AssertionObservation, BookingSubject, CheckContext, CheckDeclaration, CheckResult } from "./contracts.js";
import { verifyChecks, type FrozenChecks } from "./freeze.js";
import { errorMessage } from "./process.js";
import { readJson } from "./json.js";

class ExpectationFailure extends Error {
  constructor(readonly expectationId: string, message: string) {
    super(`[${expectationId}] ${message}`);
  }
}

async function createContext(browser: Browser, evidence: string, contexts: BrowserContext[], videos: Video[]) {
  const context = await browser.newContext({ recordVideo: { dir: evidence } });
  context.setDefaultTimeout(5000);
  context.setDefaultNavigationTimeout(5000);
  context.on("page", (page) => { const video = page.video(); if (video) videos.push(video); });
  contexts.push(context);
  return context;
}

interface BrowserLifecycle {
  restartApp?: () => Promise<string>;
  cancel?: () => Promise<void>;
  timeoutMs?: number;
}

export async function runBrowserChecks(checks: FrozenChecks, baseUrl: string, evidence: string, lifecycle: BrowserLifecycle = {}): Promise<CheckResult> {
  const { restartApp, cancel } = lifecycle;
  const timeoutMs = lifecycle.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Invalid browser workflow timeout.");
  await verifyChecks(checks);
  await mkdir(evidence, { recursive: true });
  const subject = await readJson<BookingSubject>(path.join(checks.directory, "subject.json"));
  const assertions = (await readdir(checks.directory)).includes("plan.json")
    ? await readJson<CheckDeclaration[]>(path.join(checks.directory, "plan.json")) : undefined;
  const module: { runChecks(context: CheckContext): Promise<void>; } = await import(pathToFileURL(path.join(checks.directory, "checks.ts")).href);
  const started = Date.now();
  const result: CheckResult = {
    status: "execution-error", reached: false, assertions: [], steps: [], durationMs: 0,
    trace: path.join(evidence, "trace.zip"), videos: [],
  };
  const browser = await chromium.launch();
  const contexts: BrowserContext[] = [];
  const videos: Video[] = [];
  const newContext = () => createContext(browser, evidence, contexts, videos);
  const deadline = new AbortController();
  let expired = false;
  let execution: Promise<void> | undefined;
  try {
    const context = await newContext();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    execution = module.runChecks({
      browser, context, page, subject, baseUrl, newContext, assertions,
      async restartApp() {
        await verifyChecks(checks);
        if (!restartApp) throw new Error("Server restart is unavailable for this run.");
        return restartApp();
      },
      step(name) { result.steps.push({ name, elapsedMs: Date.now() - started }); },
      reached() { result.reached = true; },
      assertCount(actual, expected, expectationId, message) {
        const observation: AssertionObservation = { actual, expected, expectationId, message, passed: actual === expected };
        result.assertions.push(observation);
        if (!observation.passed) throw new ExpectationFailure(expectationId, message);
      },
    });
    const timeout = delay(timeoutMs, undefined, { signal: deadline.signal }).then(() => {
      expired = true;
      throw new Error(`Browser workflow exceeded ${timeoutMs}ms.`);
    });
    await Promise.race([execution, timeout]);
    result.status = result.reached && result.assertions.length > 0 ? "passed" : "unreached";
  } catch (error) {
    if (expired) await cancel?.();
    result.error = errorMessage(error);
    if (error instanceof ExpectationFailure) {
      result.status = "assertion-failed";
      result.expectationId = error.expectationId;
    } else if (!result.reached) {
      result.status = "unreached";
    } else {
      result.status = expired || (error instanceof Error && error.name === "TimeoutError") ? "timeout" : "execution-error";
    }
  } finally {
    deadline.abort();
    try {
      if (contexts[0]) await contexts[0].tracing.stop({ path: result.trace });
    } finally {
      try {
        for (const context of contexts) await context.close();
        result.videos = await Promise.all(videos.map((video) => video.path()));
      } finally {
        await browser.close();
        await execution?.catch(() => undefined);
      }
    }
    result.durationMs = Date.now() - started;
  }
  return result;
}
