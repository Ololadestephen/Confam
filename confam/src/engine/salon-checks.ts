import type { CheckContext } from "./contracts.js";
import type { BookingSubject } from "./contracts.js";

export function bookingPattern(subject: BookingSubject): RegExp {
  const day = new Date(`${subject.date}T00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const text = `${day} · ${subject.slotLabel} — ${subject.service}`;
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

// Frozen into each run. Assertion results are emitted by the runner, never the app.
export async function runChecks(run: CheckContext): Promise<void> {
  const { page, context, subject } = run;
  let baseUrl = run.baseUrl;
  const assertions = run.assertions ?? [
    { expectationId: "E2", observation: "other-customer", expectedCount: 0, message: "the appointment does not appear under another customer" },
    { expectationId: "E1", observation: "after-reopen", expectedCount: 1, message: "the confirmed appointment is still listed after reopening the page" },
  ];
  const observations: Record<string, number> = {};
  run.step("Sign in as the booking customer");
  await page.goto(baseUrl);
  await page.getByLabel("Phone number").fill(subject.customerPhone);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('#appointments[aria-busy="false"]').waitFor({ state: "attached" });
  const serviceValue = await page.locator("#service option").filter({ hasText: subject.service }).getAttribute("value");
  if (!serviceValue) throw new Error("Reported service is not available.");
  run.step("Book the reported service and time");
  await page.getByLabel("Service").selectOption(serviceValue);
  await page.getByLabel("Date", { exact: true }).fill(subject.date);
  await page.getByLabel("Time", { exact: true }).selectOption({ label: subject.slotLabel });
  await page.getByRole("button", { name: "Book appointment" }).click();
  await page.getByRole("status").filter({ hasText: /^Booking confirmed$/ }).waitFor();
  run.reached();
  if (assertions.some(({ observation }) => observation === "after-confirmation")) {
    run.step("Read the customer's saved appointments after confirmation");
    const response = await context.request.get(`${baseUrl}/api/appointments`);
    if (!response.ok()) throw new Error("Could not observe saved appointments after confirmation.");
    const body: { appointments: { startsAt: string; serviceName: string; }[]; } = await response.json();
    observations["after-confirmation"] = body.appointments.filter((appointment) => appointment.startsAt === subject.startsAt && appointment.serviceName === subject.service).length;
  }

  run.step("Reopen the page as the booking customer");
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(baseUrl);
  await reopened.locator('#appointments[aria-busy="false"]').waitFor({ state: "attached" });
  const matching = (target: typeof page) => target.getByRole("listitem")
    .filter({ hasText: bookingPattern(subject) });
  observations["after-reopen"] = await matching(reopened).count();

  run.step("Check another customer's account");
  const otherContext = await run.newContext();
  try {
    const other = await otherContext.newPage();
    await other.goto(baseUrl);
    await other.getByLabel("Phone number").fill(subject.otherCustomerPhone);
    await other.getByRole("button", { name: "Continue" }).click();
    await other.locator('#appointments[aria-busy="false"]').waitFor({ state: "attached" });
    observations["other-customer"] = await matching(other).count();
    if (assertions.some(({ observation }) => observation === "other-customer-reopen")) {
      run.step("Reopen the other customer's appointment list");
      await other.reload();
      await other.locator('#appointments[aria-busy="false"]').waitFor({ state: "attached" });
      observations["other-customer-reopen"] = await matching(other).count();
    }
  } finally {
    await otherContext.close();
  }
  if (assertions.some(({ observation }) => observation === "fresh-sign-in")) {
    run.step("Sign in as the booking customer in a fresh browser context");
    const freshContext = await run.newContext();
    try {
      const fresh = await freshContext.newPage();
      await fresh.goto(baseUrl);
      await fresh.getByLabel("Phone number").fill(subject.customerPhone);
      await fresh.getByRole("button", { name: "Continue" }).click();
      await fresh.locator('#appointments[aria-busy="false"]').waitFor({ state: "attached" });
      observations["fresh-sign-in"] = await matching(fresh).count();
    } finally { await freshContext.close(); }
  }
  if (assertions.some(({ observation }) => observation === "after-restart")) {
    run.step("Restart the server and reopen the customer's appointment list");
    baseUrl = await run.restartApp();
    await reopened.goto(baseUrl);
    await reopened.locator('#appointments[aria-busy="false"]').waitFor({ state: "attached" });
    observations["after-restart"] = await matching(reopened).count();
  }
  for (const assertion of assertions) {
    const actual = observations[assertion.observation];
    if (actual === undefined) throw new Error(`Unsupported check observation: ${assertion.observation}`);
    run.assertCount(actual, assertion.expectedCount, assertion.expectationId, assertion.message);
  }
}
