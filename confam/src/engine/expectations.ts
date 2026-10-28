// Every behavioral assertion carries the ID of the agreed expectation it checks,
// written as a "[E1]" prefix in its message. The reproduction gate uses this to
// tell "failed on the reported behavior" apart from timeouts and selector errors.

const EXPECTATION_TAG = /\[(E\d+)\]/;

export type FailureReason =
  | { kind: "expectation"; expectationId: string; }
  | { kind: "other"; };

export function classifyFailure(message: string): FailureReason {
  const match = EXPECTATION_TAG.exec(message);
  return match?.[1]
    ? { kind: "expectation", expectationId: match[1] }
    : { kind: "other" };
}

export function failedForExpectation(message: string, expectationId: string): boolean {
  const reason = classifyFailure(message);
  return reason.kind === "expectation" && reason.expectationId === expectationId;
}
