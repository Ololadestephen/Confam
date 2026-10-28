import os from "node:os";
import { describe, expect, it } from "vitest";
import { errorMessage, git } from "./process.js";

describe("process errors", () => {
  it("propagates nonzero Git exits rather than reporting an empty successful result", async () => {
    await expect(git(os.tmpdir(), "confam-nonexistent-command")).rejects.toThrow("Command failed");
  });
  it("retains error details from unknown thrown values", () => {
    expect(errorMessage(new Error("failure"))).toBe("failure");
    expect(errorMessage("failure")).toBe("failure");
  });
});
