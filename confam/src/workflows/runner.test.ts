import { createServer } from "node:http";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runWorkflow } from "./runner.js";
import { validateWorkflow, type WorkflowPlan } from "./schema.js";

let url: string;
let directory: string;
let server: ReturnType<typeof createServer>;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "confam-workflow-"));
  server = createServer((req, res) => {
    if (req.url === "/redirect") { res.writeHead(302, { location: "http://external.invalid/" }); res.end(); return; }
    if (req.url === "/identity") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ cookie: req.headers.cookie ?? "none" })); return; }
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Set-Cookie", "account=first; Path=/");
    res.end('<label>Quantity<input id="quantity" value="2"></label><output data-testid="total">20</output><script>document.querySelector("input").oninput=e=>document.querySelector("output").textContent=Number(e.target.value)*10</script>');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port.");
  url = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(directory, { recursive: true, force: true });
});

function calculation(expected = 30): WorkflowPlan {
  return validateWorkflow({
    schemaVersion: 1, steps: [
      { action: "navigate", path: "/" },
      { action: "fill", locator: { kind: "label", value: "Quantity" }, value: { fixture: "quantity" } },
      { action: "capture", locator: { kind: "testId", value: "total" }, kind: "number", capture: "sum" },
      { action: "reached" },
      { action: "assert", expectationId: "updates", actual: { variable: "sum" }, operator: "eq", expected },
    ]
  }, [{ id: "updates", statement: "The quantity changes the total" }], { quantity: 3 }, { restart: false });
}
it("runs typed fixture inputs and records real trace/video evidence", async () => {
  const result = await runWorkflow(calculation(), { quantity: 3 }, url, directory);
  expect(result.status).toBe("passed");
  expect(result.assertions[0]).toMatchObject({ actual: 30, expected: 30, passed: true });
  expect((await stat(result.trace)).size).toBeGreaterThan(0);
  expect(result.videos.length).toBeGreaterThan(0);
  expect((await stat(result.videos[0]!)).size).toBeGreaterThan(0);
});
it("reports the actual failing expectation rather than a model-supplied outcome", async () => {
  const result = await runWorkflow(calculation(40), { quantity: 3 }, url, directory);
  expect(result.status).toBe("assertion-failed");
  expect(result.expectationId).toBe("updates");
  expect(result.assertions[0]?.actual).toBe(30);
});
it("keeps named browser contexts independent and observes HTTP status/body", async () => {
  const plan = validateWorkflow({
    schemaVersion: 1, steps: [
      { action: "navigate", path: "/" },
      { action: "request", method: "GET", path: "/identity", capture: "first" },
      { action: "context", name: "second" },
      { action: "request", method: "GET", path: "/identity", capture: "second" },
      { action: "reached" },
      { action: "assert", expectationId: "isolated", actual: { variable: "second.body.cookie" }, operator: "eq", expected: "none" },
    ]
  }, [{ id: "isolated", statement: "Another context has no account cookie" }], {}, { restart: false });
  expect((await runWorkflow(plan, {}, url, directory)).status).toBe("passed");
});
it("does not follow an HTTP redirect outside the project", async () => {
  const plan: WorkflowPlan = { schemaVersion: 1, steps: [{ action: "request", method: "GET", path: "/redirect", capture: "reply" }] };
  const result = await runWorkflow(plan, {}, url, directory);
  expect(result.status).toBe("unreached");
  expect(result.error).toContain("redirect");
});
it("cancels a timed-out workflow and returns after closing browser resources", async () => {
  let cancelled = false;
  const plan: WorkflowPlan = { schemaVersion: 1, steps: [{ action: "navigate", path: "/" }, { action: "wait", locator: { kind: "testId", value: "never-appears" } }] };
  const result = await runWorkflow(plan, {}, url, directory, { timeoutMs: 1500, cancel: async () => { cancelled = true; } });
  expect(result.status).toBe("timeout");
  expect(cancelled).toBe(true);
  expect(result.assertions).toEqual([]);
});

it("rejects invalid origins before browser allocation", async () => {
  await expect(runWorkflow(calculation(), { quantity: 3 }, "file:///tmp/app", directory)).rejects.toThrow("HTTP project");
});

it("compares observations with approved fixture expectations", async () => {
  const plan = calculation();
  const assertion = plan.steps.at(-1);
  if (!assertion || assertion.action !== "assert") throw new Error("Missing test assertion.");
  assertion.expected = { fixture: "expectedTotal" };
  const result = await runWorkflow(plan, { quantity: 3, expectedTotal: 30 }, url, directory);
  expect(result.status).toBe("passed");
  expect(result.assertions[0]?.expected).toBe(30);
});
