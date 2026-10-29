import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { ProjectRegistry } from "../project/registry.js";
import {
  type ModelTransport,
  type StructuredRequest,
} from "../models/client.js";
import { OnboardingService } from "./service.js";
import { CostLedger } from "../models/ledger.js";

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const requirements = {
  summary: "A fictional value does not update.",
  expectations: [
    {
      id: "valueUpdated",
      statement: "The value is two.",
      provenance: "report",
    },
  ],
  questions: ["Should it survive reopening?"],
  fixtures: { value: 2 },
  observations: [],
};
const workflow = {
  schemaVersion: 1,
  steps: [
    { action: "request", path: "/value", method: "GET", capture: "result" },
    { action: "reached" },
    {
      action: "assert",
      expectationId: "valueUpdated",
      actual: { variable: "result.value" },
      operator: "eq",
      expected: { fixture: "value" },
    },
  ],
};
async function fixture(overrides: Partial<ModelTransport> = {}) {
  const root = await mkdtemp("/private/tmp/confam-on3-");
  cleanup.push(root);
  await mkdir(path.join(root, "app"));
  await writeFile(
    path.join(root, "app", "server.js"),
    "// fictional application source",
  );
  await writeFile(
    path.join(root, "project.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "unfamiliar-app",
      root: "app",
      sourceFiles: ["server.js"],
      runtime: {
        command: ["node", "server.js"],
        readinessPath: "/ready",
        portVariable: "PORT",
        dataVariable: "STATE",
        restart: false,
      },
    }),
  );
  const registry = new ProjectRegistry(path.join(root, "registry"));
  const project = await registry.add(root);
  await registry.approve(project.id, project.revision);
  const calls: StructuredRequest[] = [];
  const transport: ModelTransport = {
    mode: "fixture",
    count: async () => 100,
    generate: async (request) => {
      calls.push(request);
      return {
        text: JSON.stringify(
          request.stage === "intake"
            ? { ...requirements, fixtures: [{ key: "value", valueJson: "2" }] }
            : {
                ...workflow,
                steps: workflow.steps.map((step) =>
                  step.action === "request"
                    ? { ...step, bodyJson: null }
                    : step,
                ),
              },
        ),
        completed: true,
        usage: { input: 100, output: 100, cached: 0 },
      };
    },
    ...overrides,
  };
  const service = new OnboardingService(
    registry,
    path.join(root, "drafts"),
    transport,
  );
  const input = {
    projectId: project.id,
    caseId: "valueWrong",
    report: "A fictional saved value is stale.",
  };
  return { root, registry, project, calls, transport, service, input };
}
const review = {
  expectations: requirements.expectations,
  fixtures: requirements.fixtures,
  reproductionTargets: ["valueUpdated"],
  answers: [
    { question: requirements.questions[0], answer: "Yes, after reopening." },
  ],
};
it("requires exact export approval, edited requirements, second consent and semantic confirmation", async () => {
  const f = await fixture();
  let session = await f.service.prepare(f.input);
  expect(f.calls).toHaveLength(0);
  expect(session.preview?.payload.input).toContain(
    "fictional application source",
  );
  await expect(f.service.generate(session.id, "0".repeat(64))).rejects.toThrow(
    "Review",
  );
  const digest = session.preview!.hash;
  session = await f.service.generate(session.id, digest);
  expect(session.status).toBe("requirements-review");
  expect(f.calls[0]!.input).toBe(
    JSON.parse(
      await readFile(
        path.join(f.root, "drafts", session.id, "session.json"),
        "utf8",
      ),
    ).session.preview.payload.input,
  );
  await expect(f.service.generate(session.id, digest)).rejects.toThrow(
    "cannot be reused",
  );
  await expect(
    f.service.workflow(session.id, { ...review, answers: [] }),
  ).rejects.toThrow("Answer every");
  await expect(
    f.service.workflow(session.id, {
      ...review,
      reproductionTargets: ["missing"],
    }),
  ).rejects.toThrow();
  session = await f.service.workflow(session.id, review);
  expect(f.calls).toHaveLength(1);
  expect(session.status).toBe("export-review");
  session = await f.service.generate(session.id, session.preview!.hash);
  expect(session.status).toBe("workflow-review");
  await expect(
    f.service.confirm(session.id, {
      schemaVersion: 1,
      steps: [{ action: "reached" }],
    }),
  ).rejects.toThrow("every confirmed expectation");
  session = await f.service.confirm(session.id, session.workflow);
  expect(session.status).toBe("confirmed");
  expect(JSON.parse(await readFile(session.files!.case, "utf8"))).toMatchObject(
    { projectId: "unfamiliar-app", reproductionTargets: ["valueUpdated"] },
  );
  expect(
    JSON.parse(await readFile(session.files!.confirmation, "utf8")).scope,
  ).toContain("No application execution");
  expect(session.files!.command).toContain("--fixture");
  expect(
    (
      await new OnboardingService(
        f.registry,
        path.join(f.root, "drafts"),
        f.transport,
      ).get(session.id)
    ).status,
  ).toBe("confirmed");
  expect(session.usage?.estimatedSpendUsd).toBe(0);
});
it("rejects changed source, malformed video, private paths and stale or repeated approval before model send", async () => {
  const f = await fixture();
  let session = await f.service.prepare(f.input);
  await writeFile(path.join(f.root, "app", "server.js"), "// source changed");
  await expect(
    f.service.generate(session.id, session.preview!.hash),
  ).rejects.toThrow("source changed");
  expect(f.calls).toHaveLength(0);
  await expect(
    f.service.prepare({
      ...f.input,
      recording: {
        name: "test.mp4",
        dataBase64: Buffer.from("not an MP4").toString("base64"),
      },
    }),
  ).rejects.toThrow("MP4");
  session = await f.service.prepare(f.input);
  const [first, second] = await Promise.allSettled([
    f.service.generate(session.id, session.preview!.hash),
    f.service.generate(session.id, session.preview!.hash),
  ]);
  expect(first.status).toBe("fulfilled");
  expect(second.status).toBe("rejected");
  expect(f.calls).toHaveLength(1);
});
it("records failures without retries and shares a capped ledger across both proposals", async () => {
  const f = await fixture({
    generate: async () => {
      throw new Error("Transport failed");
    },
  });
  let session = await f.service.prepare(f.input);
  session = await f.service.generate(session.id, session.preview!.hash);
  expect(session.status).toBe("error");
  expect(session.usage?.hasUncertainUsage).toBe(true);
  await expect(
    f.service.generate(session.id, session.preview!.hash),
  ).rejects.toThrow("cannot be reused");
  const g = await fixture({ count: async () => 1_000_000 });
  let stopped = await g.service.prepare(g.input);
  stopped = await g.service.generate(stopped.id, stopped.preview!.hash);
  expect(stopped.error).toContain("budget");
  expect(g.calls).toHaveLength(0);
  const h = await fixture();
  let interrupted = await h.service.prepare(h.input);
  const file = path.join(h.root, "drafts", interrupted.id, "session.json");
  const stored = JSON.parse(await readFile(file, "utf8"));
  stored.session.status = "generating";
  await writeFile(file, JSON.stringify(stored));
  interrupted = await new OnboardingService(
    h.registry,
    path.join(h.root, "drafts"),
    h.transport,
  ).get(interrupted.id);
  expect(interrupted.status).toBe("error");
  expect(interrupted.error).toContain("interrupted");
  expect(h.calls).toHaveLength(0);
  expect(
    (
      await CostLedger.load(
        path.join(h.root, "drafts", interrupted.id, "model-usage.json"),
      )
    ).snapshot().capNanounits,
  ).toBe(250000000);
});
it("redacts secrets before preview and transport, and prevents cross-service approval replay", async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const f = await fixture({
    generate: async (request) => {
      calls++;
      expect(request.input).not.toContain("fake-source-credential");
      entered();
      await pending;
      return {
        completed: true,
        text: JSON.stringify({
          ...requirements,
          fixtures: [{ key: "value", valueJson: "2" }],
        }),
        usage: { input: 100, output: 100, cached: 0 },
      };
    },
  });
  await writeFile(
    path.join(f.root, "app", "server.js"),
    'const apiKey = "fake-source-credential";',
  );
  const session = await f.service.prepare({
    ...f.input,
    report: "Bearer fictional-long-report-token",
  });
  expect(session.preview!.payload.input).not.toContain(
    "fake-source-credential",
  );
  expect(session.preview!.payload.input).not.toContain(
    "fictional-long-report-token",
  );
  const sending = f.service.generate(session.id, session.preview!.hash);
  await started;
  const other = new OnboardingService(
    f.registry,
    path.join(f.root, "drafts"),
    f.transport,
  );
  await expect(
    other.generate(session.id, session.preview!.hash),
  ).rejects.toThrow("locked");
  await expect(other.get(session.id)).rejects.toThrow("locked");
  release();
  await sending;
  expect(calls).toBe(1);
  await expect(
    other.generate(session.id, session.preview!.hash),
  ).rejects.toThrow("cannot be reused");
});
it("binds MP4 bytes to consent and rejects ungrounded recording observations", async () => {
  const { sampleMp4 } = await import("../recordings/fixtures.test-helper.js");
  const bytes = sampleMp4(2);
  const encoded = bytes.toString("base64");
  const f = await fixture();
  let session = await f.service.prepare({
    ...f.input,
    recording: { name: "fictional.mp4", dataBase64: encoded },
  });
  expect(session.preview?.recording?.durationSeconds).toBe(2);
  session = await f.service.generate(session.id, session.preview!.hash);
  expect(session.status).toBe("requirements-review");
  expect(f.calls[0]?.video?.dataUrl).toBe("data:video/mp4;base64," + encoded);
  session = await f.service.prepare({
    ...f.input,
    recording: { name: "fictional.mp4", dataBase64: encoded },
  });
  const file = path.join(f.root, "drafts", session.id, "session.json");
  const stored = JSON.parse(await readFile(file, "utf8"));
  stored.videoBase64 = sampleMp4(3).toString("base64");
  await writeFile(file, JSON.stringify(stored));
  await expect(
    f.service.generate(session.id, session.preview!.hash),
  ).rejects.toThrow("Recording changed");
  expect(f.calls).toHaveLength(1);
  const g = await fixture({
    generate: async () => ({
      completed: true,
      text: JSON.stringify({
        ...requirements,
        fixtures: [{ key: "value", valueJson: "2" }],
        observations: [{ timestampSeconds: 3, description: "Outside clip" }],
      }),
      usage: { input: 100, output: 100, cached: 0 },
    }),
  });
  let bad = await g.service.prepare({
    ...g.input,
    recording: { name: "fictional.mp4", dataBase64: encoded },
  });
  bad = await g.service.generate(bad.id, bad.preview!.hash);
  expect(bad.status).toBe("error");
  expect(bad.error).toContain("grounded");
});
it("rejects an unpreviewed clip inserted into a saved text-only draft", async () => {
  const { sampleMp4 } = await import("../recordings/fixtures.test-helper.js");
  const f = await fixture();
  const session = await f.service.prepare(f.input);
  const file = path.join(f.root, "drafts", session.id, "session.json");
  const stored = JSON.parse(await readFile(file, "utf8"));
  stored.videoBase64 = sampleMp4().toString("base64");
  await writeFile(file, JSON.stringify(stored));
  await expect(
    f.service.generate(session.id, session.preview!.hash),
  ).rejects.toThrow("present together");
  expect(f.calls).toHaveLength(0);
});
it("requires a fresh explicit approval after a known failure and retains the same cap and failed attempt", async () => {
  let attempt = 0;
  const f = await fixture({
    generate: async () => ({
      completed: true,
      text: JSON.stringify(
        attempt++ === 0
          ? {
              ...requirements,
              fixtures: [],
              observations: [
                { timestampSeconds: 1, description: "No clip supplied" },
              ],
            }
          : { ...requirements, fixtures: [] },
      ),
      usage: { input: 100, output: 100, cached: 0 },
    }),
  });
  let session = await f.service.prepare(f.input);
  const originalHash = session.preview!.hash;
  session = await f.service.generate(session.id, originalHash);
  expect(session.status).toBe("error");
  expect(session.usage?.hasUncertainUsage).toBe(false);
  const used = session.usage!.budgetUsedUsd;
  session = await f.service.repreview(session.id);
  expect(session.status).toBe("export-review");
  expect(session.preview!.hash).not.toBe(originalHash);
  expect(
    JSON.parse(
      await readFile(
        path.join(
          f.root,
          "drafts",
          session.id,
          "attempt-intake-" + originalHash + ".json",
        ),
        "utf8",
      ),
    ).status,
  ).toBe("error");
  await expect(f.service.generate(session.id, originalHash)).rejects.toThrow(
    "Review",
  );
  session = await f.service.generate(session.id, session.preview!.hash);
  expect(session.status).toBe("requirements-review");
  expect(session.usage!.budgetUsedUsd).toBeGreaterThan(used);
  const ledger = await CostLedger.load(
    path.join(f.root, "drafts", session.id, "model-usage.json"),
  );
  expect(ledger.snapshot().capNanounits).toBe(250000000);
  expect(ledger.snapshot().entries).toHaveLength(2);
  const g = await fixture({
    generate: async () => {
      throw Error("uncertain");
    },
  });
  let bad = await g.service.prepare(g.input);
  bad = await g.service.generate(bad.id, bad.preview!.hash);
  await expect(g.service.repreview(bad.id)).rejects.toThrow("uncertain");
});
it("keeps a semantically invalid workflow editable and blocks confirmation until corrected", async () => {
  const f = await fixture({
    generate: async (request) => ({
      completed: true,
      text: JSON.stringify(
        request.stage === "intake"
          ? { ...requirements, fixtures: [] }
          : {
              ...workflow,
              steps: [
                {
                  action: "request",
                  path: "/value",
                  method: "GET",
                  capture: "result",
                  bodyJson: null,
                },
                workflow.steps[2],
                { action: "reached" },
              ],
            },
      ),
      usage: { input: 100, output: 100, cached: 0 },
    }),
  });
  let session = await f.service.prepare(f.input);
  session = await f.service.generate(session.id, session.preview!.hash);
  session = await f.service.workflow(session.id, review);
  session = await f.service.generate(session.id, session.preview!.hash);
  expect(session.status).toBe("workflow-review");
  expect(session.error).toContain("reach point");
  await expect(f.service.confirm(session.id, session.workflow)).rejects.toThrow(
    "reach point",
  );
  session = await f.service.confirm(session.id, workflow);
  expect(session.status).toBe("confirmed");
  expect(session.error).toBeUndefined();
});
