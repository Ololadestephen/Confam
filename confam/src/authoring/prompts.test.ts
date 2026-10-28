import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { ModelClient } from "../models/client.js";
import { CostLedger } from "../models/ledger.js";
import { fixtureTransport } from "./fixture.js";
import { draftCheckPlan, draftDevelopmentDecoys, draftIntake } from "./prompts.js";

it("validates each authoring stage while keeping fixture usage separate from live spend", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-prompts-"));
  try {
    const ledger = await CostLedger.create(path.join(directory, "usage.json"), 1, "fixture");
    const client = new ModelClient(ledger, fixtureTransport());
    const intake = await draftIntake(client, "A fictional appointment disappears.");
    if (!intake.question) throw new Error("Expected fixture clarification");
    const checks = await draftCheckPlan(client, [...intake.expectations, intake.question.proposedExpectation]);
    expect(checks.assertions.map(({ expectationId }) => expectationId)).toEqual(["E2", "E1", "E3", "E4"]);
    const decoys = await draftDevelopmentDecoys(client, { "server.js": "fictional source" });
    expect(decoys.decoys.map(({ category }) => category)).toEqual(["T1", "T3", "T4"]);
    expect(ledger.snapshot().entries.map(({ stage }) => stage)).toEqual(["intake", "checks", "decoys"]);
    expect(ledger.snapshot().mode).toBe("fixture");
    expect(ledger.snapshot().estimatedSpendUsd).toBe(0);
    expect(ledger.snapshot().budgetUsedUsd).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
