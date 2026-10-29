import { expect, it, vi, afterEach } from "vitest";
import { pageUrl, routeFor } from "./routing.js";
afterEach(() => vi.unstubAllGlobals());
it("distinguishes landing, setup and all evidence deep links", () => {
  expect(routeFor("/")).toEqual({ page: "home" });
  expect(routeFor("/runs/new")).toEqual({ page: "new" });
  for (const page of ["expectations", "live", "checks", "compare"])
    expect(routeFor(`/runs/verify-one/${page}`)).toEqual({
      page,
      runId: "verify-one",
    });
  expect(routeFor("/runs/verify-one/decoys/decoy-one")).toEqual({
    page: "decoy",
    runId: "verify-one",
    variantId: "decoy-one",
  });
  expect(routeFor("/share/verify-one")).toEqual({
    page: "share",
    runId: "verify-one",
  });
  expect(routeFor("/runs/one/unrelated")).toEqual({ page: "missing" });
});
it("preserves the temporary review token on page navigation", () => {
  vi.stubGlobal("window", {
    location: { origin: "http://127.0.0.1:1234", search: "?token=local-token" },
  });
  expect(pageUrl("/runs/new")).toBe("/runs/new?token=local-token");
});
