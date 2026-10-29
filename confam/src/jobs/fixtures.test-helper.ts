import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { ProjectRegistry } from "../project/registry.js";
import { loadProjectConfig } from "../project/config.js";
import { OnboardingService } from "../onboarding/service.js";
import type { ModelTransport } from "../models/client.js";
import type { WorkflowPlan } from "../workflows/schema.js";
import { captureProject } from "./snapshot.js";
import { ExecutionManager } from "./manager.js";
const workspace = fileURLToPath(new URL("../../../", import.meta.url));
async function fixtureJson(file: string) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new Error("Integration fixture JSON is invalid.");
  }
}
export function wireWorkflow(plan: WorkflowPlan) {
  return {
    ...plan,
    steps: plan.steps.map((step) => {
      const value = { ...step } as Record<string, unknown>;
      if (step.action === "request") {
        delete value.body;
        value.bodyJson =
          step.body === undefined ? null : JSON.stringify(step.body);
      }
      if (step.action === "select") value.by = step.by ?? null;
      if ("locator" in step && step.locator.kind === "role")
        value.locator = { ...step.locator, name: step.locator.name ?? null };
      return value;
    }),
  };
}
export async function executionFixture(
  options: {
    rootDirectory?: string;
    app?: "quote-tool" | "task-board";
    source?: string;
    plan?: WorkflowPlan;
  } = {},
) {
  const root =
    options.rootDirectory ?? (await mkdtemp("/private/tmp/confam-on4-"));
  await mkdir(root, { recursive: true });
  const projectRoot = path.join(root, "project");
  await mkdir(projectRoot);
  const app = options.app ?? "quote-tool";
  const original = path.join(workspace, "specimens", app);
  const loaded = await loadProjectConfig(path.join(original, "project.json"));
  await captureProject(loaded.root, path.join(projectRoot, "app"));
  let config = { ...loaded.config, root: "app" };
  if (options.source) {
    await writeFile(
      path.join(projectRoot, "app", "server.cjs"),
      options.source,
    );
    config = {
      schemaVersion: 1,
      id: "fresh-app",
      root: "app",
      sourceFiles: ["server.cjs"],
      protectedPaths: [],
      runtime: {
        command: [process.execPath, "server.cjs"],
        readinessPath: "/ready",
        timeoutMs: 10000,
        portVariable: "PORT",
        dataVariable: "STATE",
        restart: false,
      },
    };
  }
  await writeFile(
    path.join(projectRoot, "project.json"),
    JSON.stringify(config),
  );
  const caseData = await fixtureJson(
    path.join(
      original,
      app === "quote-tool" ? "case-quantity.json" : "case-verify.json",
    ),
  );
  const plan: WorkflowPlan =
    options.plan ??
    (await fixtureJson(
      path.join(
        original,
        app === "quote-tool" ? "workflow-quantity.json" : "workflow.json",
      ),
    ));
  const registryDirectory = path.join(root, "registry");
  const registry = new ProjectRegistry(registryDirectory);
  const project = await registry.add(projectRoot);
  await registry.approve(project.id, project.revision);
  const transport: ModelTransport = {
    mode: "fixture",
    count: async () => 100,
    generate: async (request) => ({
      completed: true,
      text: JSON.stringify(
        request.stage === "intake"
          ? {
              summary: "Fictional integration case.",
              expectations: caseData.expectations.map(
                (item: { id: string; statement: string }) => ({
                  ...item,
                  provenance: "report",
                }),
              ),
              questions: [],
              fixtures: [],
              observations: [],
            }
          : wireWorkflow(plan),
      ),
      usage: { input: 100, output: 100, cached: 0 },
    }),
  };
  const onboarding = new OnboardingService(
    registry,
    path.join(registryDirectory, "drafts"),
    transport,
  );
  let draft = await onboarding.prepare({
    projectId: project.id,
    caseId: caseData.id,
    report: "Fictional integration report.",
  });
  draft = await onboarding.generate(draft.id, draft.preview!.hash);
  draft = await onboarding.workflow(draft.id, {
    expectations: draft.requirements!.expectations,
    fixtures: {},
    reproductionTargets: [draft.requirements!.expectations[0]!.id],
    answers: [],
  });
  draft = await onboarding.generate(draft.id, draft.preview!.hash);
  draft = await onboarding.confirm(draft.id, plan);
  const runs = path.join(root, "runs");
  await mkdir(runs);
  const manager = new ExecutionManager(
    onboarding,
    path.join(registryDirectory, "jobs"),
    runs,
  );
  const patch = await readFile(
    path.join(
      original,
      app === "quote-tool" ? "patches/good.patch" : "control-a.patch",
    ),
    "utf8",
  );
  return {
    root,
    projectRoot,
    registryDirectory,
    registry,
    transport,
    onboarding,
    draft,
    runs,
    manager,
    patch,
    async cleanup() {
      await manager.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
export async function until<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeout = 20000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await delay(40);
  }
  throw new Error("Timed out waiting for real execution state.");
}
