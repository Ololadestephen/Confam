import { isDeepStrictEqual } from "node:util";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { resolveValue, type WorkflowLocator, type WorkflowStep } from "./schema.js";

export interface PageState { context: BrowserContext; page: Page; }

export function locate(page: Page, definition: WorkflowLocator): Locator {
  switch (definition.kind) {
    case "role": return page.getByRole(definition.value, definition.name === undefined ? {} : { name: definition.name, exact: true });
    case "label": return page.getByLabel(definition.value, { exact: true });
    case "testId": return page.getByTestId(definition.value);
    case "css": return page.locator(definition.value);
    default: throw new Error("Unsupported workflow locator.");
  }
}
export function localUrl(baseUrl: string, relative: string): string {
  const base = new URL(baseUrl);
  const target = new URL(relative, base);
  if (target.origin !== base.origin || !["http:", "https:"].includes(target.protocol)) throw new Error("Workflow URL escapes the project origin.");
  return target.href;
}
function textInput(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new Error("Form input must resolve to a scalar value.");
  return String(value);
}
export function comparison(actual: unknown, expected: unknown, operator: "eq" | "gte" | "lte"): boolean {
  if (operator === "eq") return isDeepStrictEqual(actual, expected);
  if (operator !== "gte" && operator !== "lte") throw new Error("Unsupported assertion operator.");
  if (typeof actual !== "number" || !Number.isFinite(actual) || typeof expected !== "number" || !Number.isFinite(expected)) throw new Error("Numeric assertion received a nonnumeric observation.");
  return operator === "gte" ? actual >= expected : actual <= expected;
}
export async function capture(locator: Locator, kind: "text" | "count" | "visible" | "number"): Promise<unknown> {
  if (kind === "count") return locator.count();
  if (kind === "visible") return locator.isVisible();
  const value = await locator.innerText();
  if (kind === "text") return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) throw new Error("Numeric capture is not a finite number.");
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) throw new Error("Numeric capture is not a finite number.");
  return numeric;
}


export async function executePageAction(
  state: PageState, step: WorkflowStep, baseUrl: string, fixtures: Record<string, unknown>, variables: Record<string, unknown>,
): Promise<boolean> {
  const { context, page } = state;
  switch (step.action) {
    case "navigate": await page.goto(localUrl(baseUrl, step.path)); return true;
    case "fill": await locate(page, step.locator).fill(textInput(resolveValue(step.value, fixtures, variables))); return true;
    case "click": await locate(page, step.locator).click(); return true;
    case "select": {
      const value = textInput(resolveValue(step.value, fixtures, variables));
      await locate(page, step.locator).selectOption(step.by === "label" ? { label: value } : { value }); return true;
    }
    case "wait": await locate(page, step.locator).waitFor({ state: "attached" }); return true;
    case "reload": {
      // After a restart the project may listen on a new origin; reload the same route there.
      const current = new URL(page.url());
      if (current.origin === new URL(baseUrl).origin) await page.reload();
      else await page.goto(localUrl(baseUrl, current.pathname + current.search + current.hash));
      return true;
    }
    case "reopen": {
      const previous = new URL(page.url());
      await page.close(); state.page = await context.newPage();
      await state.page.goto(localUrl(baseUrl, previous.pathname + previous.search + previous.hash)); return true;
    }
    default: return false;
  }
}
