import type { BrowserContext, Locator, Page } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { capture, comparison, executePageAction, localUrl } from "./actions.js";

function textLocator(text: string): Locator {
  return { innerText: async () => text } as Locator;
}

describe("typed workflow observations", () => {
  it.each([
    [" 30.5 ", 30.5], ["-2", -2], ["1e3", 1000], [".25", 0.25],
  ])("captures numeric text %s without losing numeric type", async (text, expected) => {
    expect(await capture(textLocator(text), "number")).toBe(expected);
  });

  it.each(["", "   ", "₦30", "30 units", "Infinity", "1e999", "NaN"])("rejects ambiguous numeric text %s", async (text) => {
    await expect(capture(textLocator(text), "number")).rejects.toThrow("finite number");
  });

  it("does not coerce string observations into numbers for assertions", () => {
    expect(comparison("30", 30, "eq")).toBe(false);
    expect(() => comparison("30", 30, "gte")).toThrow("nonnumeric");
    expect(() => comparison(30, Infinity, "lte")).toThrow("nonnumeric");
    expect(comparison(30, 20, "gte")).toBe(true);
    expect(comparison(30, 20, "lte")).toBe(false);
  });
});

describe("workflow URL confinement", () => {
  it("resolves same-origin routes and preserves query values", () => {
    expect(localUrl("http://127.0.0.1:4310", "/items?name=sample#row")).toBe("http://127.0.0.1:4310/items?name=sample#row");
  });

  it.each(["https://external.example/path", "//external.example/path", "http://127.0.0.1:4311/", "javascript:alert(1)"])("rejects origin escape %s", (target) => {
    expect(() => localUrl("http://127.0.0.1:4310", target)).toThrow("project origin");
  });
});

describe("reload after restart", () => {
  function fakePage(url: string) {
    const calls: string[] = [];
    const page = {
      url: () => url,
      reload: async () => { calls.push("reload"); },
      goto: async (target: string) => { calls.push(`goto ${target}`); },
    } as unknown as Page;
    return { page, calls };
  }
  const reload = { action: "reload" } as const;

  it("reloads in place while the project origin is unchanged", async () => {
    const { page, calls } = fakePage("http://127.0.0.1:4310/bookings?day=sat");
    await executePageAction({ context: {} as BrowserContext, page }, reload, "http://127.0.0.1:4310", {}, {});
    expect(calls).toEqual(["reload"]);
  });

  it("opens the same route on the restarted origin", async () => {
    const { page, calls } = fakePage("http://127.0.0.1:4310/bookings?day=sat#list");
    await executePageAction({ context: {} as BrowserContext, page }, reload, "http://127.0.0.1:4322", {}, {});
    expect(calls).toEqual(["goto http://127.0.0.1:4322/bookings?day=sat#list"]);
  });
});
