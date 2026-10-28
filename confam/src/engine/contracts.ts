import type { Browser, BrowserContext, Page } from "@playwright/test";

export interface CheckDeclaration {
  expectationId: "E1" | "E2" | "E3" | "E4";
  observation: "after-reopen" | "other-customer" | "after-confirmation" | "after-restart" | "fresh-sign-in" | "other-customer-reopen";
  expectedCount: number;
  message: string;
}

export interface BookingSubject {
  customerPhone: string;
  otherCustomerPhone: string;
  service: string;
  date: string;
  slotLabel: string;
  startsAt: string;
}

export interface CheckContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  baseUrl: string;
  subject: BookingSubject;
  assertions?: CheckDeclaration[];
  restartApp(): Promise<string>;
  newContext(): Promise<BrowserContext>;
  step(name: string): void;
  reached(): void;
  assertCount(actual: number, expected: number, expectationId: string, message: string): void;
}

export interface AssertionObservation {
  expectationId: string;
  message: string;
  actual: number;
  expected: number;
  passed: boolean;
}

export interface CheckResult {
  status: "passed" | "assertion-failed" | "unreached" | "execution-error" | "timeout";
  reached: boolean;
  assertions: AssertionObservation[];
  steps: { name: string; elapsedMs: number; }[];
  error?: string;
  expectationId?: string;
  durationMs: number;
  trace: string;
  videos: string[];
}

export interface ProbeObservation {
  holds: boolean;
  observed: unknown;
}

export interface ProbeRequirement {
  probe: string;
  holds: boolean;
}

export interface VariantSpec {
  id: string;
  kind: "original" | "control" | "development" | "held-out" | "candidate";
  patch?: string;
  violation?: string;
  serverErrorIncludes?: string;
  patchSource?: "model-edits" | "curated-mutation";
  requirements: ProbeRequirement[];
}

export type DecoyOutcome =
  | "caught" | "survived" | "invalid" | "unreached"
  | "execution-error" | "timeout" | "unconfirmed";

export interface VariantResult {
  id: string;
  kind: VariantSpec["kind"];
  outcome: DecoyOutcome | "passed" | "falsely-rejected" | "bug-reproduced" | "rejected";
  violation?: string;
  requirements: ProbeRequirement[];
  checks?: CheckResult;
  probes: Record<string, ProbeObservation>;
  serverErrors?: string[];
  patchSource?: VariantSpec["patchSource"];
  error?: string;
}
