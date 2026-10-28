import { describe, expect, it } from "vitest";
import { bookingPattern } from "./salon-checks.js";

describe("booking identity in browser checks", () => {
  const subject = { customerPhone: "1", otherCustomerPhone: "2", service: "Braids (long)", date: "2026-10-31", slotLabel: "2:00 PM", startsAt: "2026-10-31T14:00" };
  const pattern = bookingPattern(subject);
  it("matches the complete reported date, time, and service", () => {
    expect(pattern.test("Sat 31 Oct · 2:00 PM — Braids (long)")).toBe(true);
  });
  it("does not confuse noon, another date, or a similar service with the reported booking", () => {
    expect(pattern.test("Sat 31 Oct · 12:00 PM — Braids (long)")).toBe(false);
    expect(pattern.test("Sun 1 Nov · 2:00 PM — Braids (long)")).toBe(false);
    expect(pattern.test("Sat 31 Oct · 2:00 PM — Braids long")).toBe(false);
  });
});
