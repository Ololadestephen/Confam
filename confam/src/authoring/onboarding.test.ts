import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  ModelClient,
  type ModelTransport,
  type StructuredRequest,
} from "../models/client.js";
import { CostLedger } from "../models/ledger.js";
import {
  draftRequirements,
  draftReviewedWorkflow,
  REQUIREMENTS_INSTRUCTIONS,
  WORKFLOW_INSTRUCTIONS,
} from "./onboarding.js";

const requirements = {
  summary: "A report",
  expectations: [{ id: "E1", statement: "Save works", provenance: "report" }],
  questions: [],
  fixtures: [],
  observations: [],
};
const workflow = { schemaVersion: 1, steps: [{ action: "reached" }] };

async function fixture(
  output: unknown,
  run: (client: ModelClient, requests: StructuredRequest[]) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-onboarding-"));
  const requests: StructuredRequest[] = [];
  const transport: ModelTransport = {
    mode: "fixture",
    count: async (request) => {
      requests.push(request);
      return 10;
    },
    generate: async (request) => {
      requests.push(request);
      return {
        text: JSON.stringify(output),
        completed: true,
        usage: { input: 10, output: 10, cached: 0 },
      };
    },
  };
  try {
    const ledger = await CostLedger.create(
      path.join(directory, "usage.json"),
      0.25,
      "fixture",
    );
    await run(new ModelClient(ledger, transport), requests);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

it("drafts requirements through intake, forwarding only the supplied context and optional video", async () => {
  await fixture(requirements, async (client, requests) => {
    const video = { dataUrl: "data:video/mp4;base64,YQ==" };
    expect(await draftRequirements(client, "report context", video)).toEqual({
      ...requirements,
      fixtures: {},
    });
    expect(requests).toHaveLength(2);
    for (const request of requests)
      expect(request).toMatchObject({
        stage: "intake",
        input: "report context",
        instructions: REQUIREMENTS_INSTRUCTIONS,
        maxOutputTokens: 4096,
        video,
      });
    expect(requests[0]!.input).not.toContain("candidate");
  });
  await fixture(requirements, async (client, requests) => {
    await draftRequirements(client, "report");
    expect(requests[0]).not.toHaveProperty("video");
  });
});

it("drafts a reviewed workflow through checks and rejects invalid model output", async () => {
  await fixture(workflow, async (client, requests) => {
    expect(await draftReviewedWorkflow(client, "reviewed context")).toEqual(
      workflow,
    );
    expect(requests[0]).toMatchObject({
      stage: "checks",
      input: "reviewed context",
      instructions: WORKFLOW_INSTRUCTIONS,
      maxOutputTokens: 8192,
    });
    expect(requests[0]).not.toHaveProperty("video");
  });
  await fixture({ ...requirements, extra: true }, async (client) => {
    await expect(draftRequirements(client, "report")).rejects.toThrow(
      "required schema",
    );
  });
  for (const question of ["", "x".repeat(2001)]) {
    await fixture(
      { ...requirements, questions: [question] },
      async (client) => {
        await expect(draftRequirements(client, "report")).rejects.toThrow(
          "required schema",
        );
      },
    );
  }
  await fixture(
    { schemaVersion: 1, steps: [{ action: "execute", code: "bad" }] },
    async (client) => {
      await expect(draftReviewedWorkflow(client, "reviewed")).rejects.toThrow(
        "required schema",
      );
    },
  );
});
