import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { engineIdentity } from "./identity.js";
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
afterEach(() => { vi.mocked(readFile).mockClear(); });
it("invalidates trusted identity when a production source byte stream changes", async () => {
  const before = await engineIdentity();
  expect(await engineIdentity()).toBe(before);
  vi.mocked(readFile).mockResolvedValueOnce(Buffer.from("changed trusted implementation"));
  expect(await engineIdentity()).not.toBe(before);
});
