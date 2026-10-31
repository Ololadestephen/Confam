import { describe, expect, it } from "vitest";
import { parseArguments } from "./arguments.js";

describe("CLI confirmation and cost arguments", () => {
  it("requires an explicit candidate and reviewed inputs for the review command", () => {
    const args = ["review", "case.json", "--project", "p", "--workflow", "w", "--accept"];
    expect(() => parseArguments(args)).toThrow("--candidate");
    expect(parseArguments([...args, "--candidate", "fix.patch", "--manifest", "faults.json"]).manifest).toBe("faults.json");
    expect(() => parseArguments([...args, "--candidate", "fix.patch", "--strengthen"])).toThrow("Invalid");
  });
  it("binds gap drafting to a reviewed export and rejects competing preview mode", () => {
    expect(parseArguments(["draft-gaps", "case.json", "--project", "project.json", "--approved-export", "export.json"]).approvedExport).toBe("export.json");
    expect(() => parseArguments(["draft-gaps", "case.json", "--project", "p", "--preview", "--approved-export", "e"])).toThrow("not both");
    expect(() => parseArguments(["draft-fix", "case.json", "--project", "p", "--approved-export", "e"])).toThrow("Invalid");
    expect(() => parseArguments(["draft-gaps", "case.json", "--project", "p"])).toThrow("requires --approved-export");
  });
  it("requires a written recording report and bounds the local review port", () => {
    expect(() => parseArguments(["recording-intake", "video.mp4"])).toThrow("report");
    expect(parseArguments(["recording-intake", "video.mp4", "--report", "report.md", "--budget", "0.25"]).report).toBe("report.md");
    expect(parseArguments(["serve", "run", "--port", "0"]).port).toBe(0);
    for (const value of ["NaN", "-1", "65536", "1.5"]) expect(() => parseArguments(["serve", "run", "--port", value])).toThrow("port");
    expect(() => parseArguments(["serve", "run", "--fix"])).toThrow("Invalid");
  });
  it("requires explicit challenge/evaluation inputs and separates fixture/live verifier options", () => {
    expect(() => parseArguments(["challenge", "case", "--project", "p", "--workflow", "w", "--fixture"])).toThrow("manifest");
    expect(() => parseArguments(["challenge", "case", "--project", "p", "--workflow", "w", "--fixture", "--manifest", "m", "--strengthen"])).toThrow("Live model");
    expect(() => parseArguments(["compare", "run"])).toThrow("pack");
    expect(parseArguments(["compare", "run", "--pack", "pack", "--integration-fixture"]).integrationFixture).toBe(true);
    expect(() => parseArguments(["draft-decoys", "case", "--project", "p"])).toThrow("registry");
  });
  it("requires project, workflow and a single explicit confirmation source for generic verification", () => {
    expect(() => parseArguments(["verify", "case.json"])).toThrow("project");
    expect(() => parseArguments(["verify", "case.json", "--project", "p.json", "--workflow", "w.json"])).toThrow("--accept");
    expect(() => parseArguments(["verify", "case.json", "--project", "p.json", "--workflow", "w.json", "--accept", "--fixture"])).toThrow("--accept");
    expect(parseArguments(["verify", "case.json", "--project", "p.json", "--workflow", "w.json", "--fixture"]).fixture).toBe(true);
  });
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
