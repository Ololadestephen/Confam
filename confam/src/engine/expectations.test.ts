import { describe, expect, it } from "vitest";
import { classifyFailure, failedForExpectation } from "./expectations.js";

describe("classifyFailure", () => {
  it("finds the expectation ID in an assertion message", () => {
    const message = "Error: [E1] appointment still listed after reopening the page\n\nexpect(locator).toBeVisible() failed";
    expect(classifyFailure(message)).toEqual({ kind: "expectation", expectationId: "E1" });
  });

  it("treats untagged failures as other", () => {
    const message = "TimeoutError: locator.click: Timeout 30000ms exceeded.";
    expect(classifyFailure(message)).toEqual({ kind: "other" });
  });
});

describe("failedForExpectation", () => {
  it("is true only for the named expectation", () => {
    const message = "Error: [E2] appointment not visible to another customer";
    expect(failedForExpectation(message, "E2")).toBe(true);
    expect(failedForExpectation(message, "E1")).toBe(false);
  });
});
