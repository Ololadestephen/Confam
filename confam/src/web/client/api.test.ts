import { afterEach, expect, it, vi } from "vitest";
import { apiUrl, artifactUrl, readRun } from "./api.js";
afterEach(() => vi.unstubAllGlobals());
it("keeps authenticated evidence navigation on the local review origin", () => {
  vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:1234", search: "?token=local-secret" } });
  expect(apiUrl("/api/run")).toBe("/api/run?token=local-secret");
  expect(artifactUrl("https://remote.example/video.webm")).toBeUndefined();
  expect(artifactUrl("javascript:alert(1)")).toBeUndefined();
  expect(artifactUrl("/api/artifacts/id")).toBe("/api/artifacts/id?token=local-secret");
  expect(() => readRun({ status: "completed" })).toThrow("incomplete");
});
