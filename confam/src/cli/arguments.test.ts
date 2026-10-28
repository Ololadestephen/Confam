import { describe, expect, it } from "vitest";
import { parseArguments } from "./arguments.js";

describe("CLI confirmation and cost arguments", () => {
  it("accepts a project runtime check without model or repair options", () => {
    expect(parseArguments(["project-check", "project.json"]).command).toBe("project-check");
    expect(() => parseArguments(["project-check", "project.json", "--fix"])).toThrow("Invalid");
  });
  it("requires an explicit held-out pack and rejects competing candidate sources", () => {
    expect(() => parseArguments(["heldout", "model-id"])).toThrow("--pack");
    expect(() => parseArguments(["execute", "model-id", "--fix", "--candidate", "x.patch"])).toThrow("not both");
    expect(parseArguments(["recheck", "model-id", "--fix"]).fix).toBe(true);
  });
  it("requires explicit acceptance and validates a clarifying answer", () => {
    expect(() => parseArguments(["confirm", "model-id"])).toThrow("--accept");
    expect(() => parseArguments(["confirm", "model-id", "--accept", "--answer", "maybe"])).toThrow("yes or no");
    expect(parseArguments(["confirm", "model-id", "--accept", "--answer", "no"]).answer).toBe("no");
  });
  it.each(["0", "-1", "NaN", "Infinity"])("rejects an invalid budget %s", (value) => {
    expect(() => parseArguments(["intake", "case", "--budget", value])).toThrow();
  });
  it("rejects duplicate and unsupported flags without silently ignoring them", () => {
    expect(() => parseArguments(["run", "case", "--budget", "1"])).toThrow("Invalid");
    expect(() => parseArguments(["intake", "case", "--budget", "1", "--budget", "2"])).toThrow("duplicate");
    expect(parseArguments(["demo", "case", "--budget", "0.1"]).budget).toBe(0.1);
  });
});
