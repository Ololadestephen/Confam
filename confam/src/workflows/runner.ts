import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Video } from "@playwright/test";
import { resolveBody, resolveValue, workflowSchema, type WorkflowPlan, type WorkflowStep } from "./schema.js";
import { capture, comparison, executePageAction, localUrl, locate, type PageState } from "./actions.js";

export interface WorkflowObservation {
  expectationId: string;
  actual: unknown;
  expected: unknown;
  operator: "eq" | "gte" | "lte";
  passed: boolean;
}
export interface WorkflowResult {
  status: "passed" | "assertion-failed" | "unreached" | "timeout" | "execution-error" | "cancelled";
  reached: boolean;
  assertions: WorkflowObservation[];
  steps: { name: string; elapsedMs: number; }[];
  expectationId?: string;
  error?: string;
  durationMs: number;
  cleanupComplete?: boolean;
  trace: string;
  traces: string[];
  videos: string[];
  // Present only when recordings were deliberately paced for viewing.
  viewingSlowMoMs?: number;
}
export interface WorkflowLifecycle {
  restartApp?: () => Promise<string>;
  cancel?: () => Promise<void>;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStep?: (event: { stepIndex: number; action: string }) => void;
}
const MAX_WORKFLOW_TIMEOUT_MS = 120_000;

// Opt-in pacing so recordings are watchable in a demo. It slows browser actions only; it never
// changes what is asserted, and the result records that it was used.
export function viewingSlowMo(value = process.env.CONFAM_VIEWING_SLOW_MO_MS): number {
  if (value === undefined || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) throw new Error("CONFAM_VIEWING_SLOW_MO_MS must be an integer from 0 to 1000.");
  return parsed;
}

class AssertionFailure extends Error {
  constructor(readonly expectationId: string) { super(`Expectation ${expectationId} failed.`); }
}



class WorkflowExecution {
  readonly contexts = new Map<string, PageState>();
  readonly videos: Video[] = [];
  readonly variables: Record<string, unknown> = Object.create(null);
  current: PageState | undefined;
  constructor(
    readonly browser: Browser, readonly fixtures: Record<string, unknown>, public baseUrl: string,
    readonly evidence: string, readonly result: WorkflowResult, readonly lifecycle: WorkflowLifecycle,
  ) { }
  async context(name: string): Promise<void> {
    let state = this.contexts.get(name);
    if (!state) {
      const context = await this.browser.newContext({ recordVideo: { dir: this.evidence }, serviceWorkers: "block" });
      context.setDefaultTimeout(5000); context.setDefaultNavigationTimeout(5000);
      context.on("page", (page) => { const video = page.video(); if (video) this.videos.push(video); });
      await context.route("**/*", async (route) => {
        if (new URL(route.request().url()).origin === new URL(this.baseUrl).origin) await route.continue();
        else await route.abort("blockedbyclient");
      });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      state = { context, page: await context.newPage() };
      this.contexts.set(name, state);
    }
    this.current = state;
  }
  async step(step: WorkflowStep): Promise<void> {
    const state = this.current;
    if (!state) throw new Error("Workflow context is unavailable.");
    const { context, page } = state;
    if (!await executePageAction(state, step, this.baseUrl, this.fixtures, this.variables)) switch (step.action) {
      case "context": await this.context(step.name); break;
      case "restart": {
        if (!this.lifecycle.restartApp) throw new Error("Project restart is unavailable.");
        const next = new URL(await this.lifecycle.restartApp());
        if (!["http:", "https:"].includes(next.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(next.hostname)) throw new Error("Restart returned an unsupported project origin.");
        this.baseUrl = next.origin; break;
      }
      case "request": {
        const response = await context.request.fetch(localUrl(this.baseUrl, step.path), {
          method: step.method, data: step.body === undefined ? undefined : resolveBody(step.body, this.fixtures, this.variables), maxRedirects: 0, timeout: 5000,
        });
        try {
          if (response.status() >= 300 && response.status() < 400) throw new Error("HTTP redirects are unsupported in workflow requests.");
          const contentType = response.headers()["content-type"] ?? "";
          this.variables[step.capture] = { status: response.status(), body: contentType.includes("json") ? await response.json() : await response.text() };
        } finally { await response.dispose(); }
        break;
      }
      case "capture": this.variables[step.capture] = await capture(locate(page, step.locator), step.kind); break;
      case "reached": this.result.reached = true; break;
      case "assert": {
        const actual = resolveValue(step.actual, this.fixtures, this.variables);
        const expected = resolveValue(step.expected, this.fixtures, {});
        const observation: WorkflowObservation = { expectationId: step.expectationId, actual, expected, operator: step.operator, passed: comparison(actual, expected, step.operator) };
        this.result.assertions.push(observation);
        if (!observation.passed) throw new AssertionFailure(step.expectationId);
        break;
      }
      default: throw new Error("Unsupported workflow action.");
    }
    const currentUrl = this.current?.page.url();
    const usesPage = ["navigate", "click", "fill", "select", "wait", "reload", "reopen", "capture"].includes(step.action);
    if (usesPage && currentUrl && currentUrl !== "about:blank" && new URL(currentUrl).origin !== new URL(this.baseUrl).origin) throw new Error("Page left the project origin.");
  }
  async close(): Promise<void> {
    let index = 0;
    try {
      for (const { context } of this.contexts.values()) {
        const trace = path.join(this.evidence, index++ === 0 ? "trace.zip" : `trace-${index}.zip`);
        try { await context.tracing.stop({ path: trace }); this.result.traces.push(trace); }
        finally { await context.close(); }
      }
      this.result.videos = await Promise.all(this.videos.map((video) => video.path()));
    } finally { await this.browser.close(); }
  }
}

export async function runWorkflow(
  input: WorkflowPlan, fixtures: Record<string, unknown>, baseUrl: string, evidence: string, lifecycle: WorkflowLifecycle = {},
): Promise<WorkflowResult> {
  const plan = workflowSchema.parse(input);
  const timeoutMs = lifecycle.timeoutMs ?? 30000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_WORKFLOW_TIMEOUT_MS) throw new Error("Invalid workflow deadline.");
  const projectUrl = new URL(baseUrl);
  if (!["http:", "https:"].includes(projectUrl.protocol)) throw new Error("Workflow requires an HTTP project origin.");
  const started = Date.now();
  await mkdir(evidence, { recursive: true });
  const result: WorkflowResult = { status: "execution-error", reached: false, assertions: [], steps: [], durationMs: 0, trace: path.join(evidence, "trace.zip"), traces: [], videos: [] };
  let execution: WorkflowExecution | undefined;
  let operation: Promise<void> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  let cancelled = lifecycle.signal?.aborted ?? false;
  let interrupt: Promise<void> | undefined;
  const onAbort = () => {
    cancelled = true;
    interrupt = Promise.allSettled([execution?.browser.close(), lifecycle.cancel?.()]).then((results) => {
      const failed = results.find((item) => item.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    });
  };
  lifecycle.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (cancelled) throw new Error("Workflow cancelled.");
    const slowMo = viewingSlowMo();
    if (slowMo > 0) result.viewingSlowMoMs = slowMo;
    const browser = await chromium.launch({ timeout: Math.min(timeoutMs, 30000), slowMo });
    execution = new WorkflowExecution(browser, fixtures, projectUrl.origin, evidence, result, lifecycle);
    const active = execution;
    if (cancelled) { await browser.close(); throw new Error("Workflow cancelled."); }
    operation = (async () => {
      await active.context("default");
      for (const [stepIndex, step] of plan.steps.entries()) {
        if (cancelled) throw new Error("Workflow cancelled.");
        try { lifecycle.onStep?.({ stepIndex, action: step.action }); } catch { /* Observers are isolated. */ }
        result.steps.push({ name: step.action, elapsedMs: Date.now() - started });
        await active.step(step);
      }
    })();
    await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => { expired = true; reject(new Error(`Workflow exceeded ${timeoutMs}ms.`)); }, Math.max(1, timeoutMs - (Date.now() - started)));
    })]);
    if (cancelled) throw new Error("Workflow cancelled.");
    result.status = result.reached && result.assertions.length > 0 ? "passed" : "unreached";
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    if (cancelled) result.status = "cancelled";
    else if (error instanceof AssertionFailure) { result.status = "assertion-failed"; result.expectationId = error.expectationId; }
    else result.status = expired || (error instanceof Error && error.name === "TimeoutError") ? "timeout" : result.reached ? "execution-error" : "unreached";
  } finally {
    clearTimeout(timeout);
    lifecycle.signal?.removeEventListener("abort", onAbort);
    try { await interrupt; } catch (error) { result.cleanupComplete = false; result.error = `Cancellation cleanup failed: ${error instanceof Error ? error.message : String(error)}`; }
    try { if (expired) await lifecycle.cancel?.(); }
    catch (error) { result.cleanupComplete = false; result.error = `${result.error ?? ""} Cancellation failed: ${error instanceof Error ? error.message : String(error)}`; }
    try { await execution?.close(); if (result.cleanupComplete !== false) result.cleanupComplete = true; }
    catch (error) {
      result.cleanupComplete = false;
      if (!cancelled) result.status = "execution-error";
      result.error = `Evidence cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally { await operation?.catch(() => undefined); result.durationMs = Date.now() - started; }
  }
  return result;
}
