import type { CheckResult, DecoyOutcome, ProbeObservation, ProbeRequirement, VariantResult, VariantSpec } from "./contracts.js";

export function classifyDecoy(
  checks: CheckResult,
  requirements: ProbeRequirement[],
  observations: Record<string, ProbeObservation>,
): DecoyOutcome {
  if (!checks.reached || checks.status === "unreached") return "unreached";
  if (checks.status === "execution-error" || checks.status === "timeout") return checks.status;
  if (requirements.length === 0 || !requirements.every(({ probe, holds }) => observations[probe]?.holds === holds)) {
    return "unconfirmed";
  }
  return checks.status === "assertion-failed" ? "caught" : "survived";
}

export function classifyVariant(spec: VariantSpec, checks: CheckResult, probes: Record<string, ProbeObservation>): VariantResult["outcome"] {
  switch (spec.kind) {
    case "development":
    case "held-out": return classifyDecoy(checks, spec.requirements, probes);
    case "control": return checks.status === "passed" && Object.values(probes).every(({ holds }) => holds)
      ? "passed" : "falsely-rejected";
    case "original": return checks.status === "assertion-failed" && checks.expectationId === "E1"
      && probes["appointment-saved"]?.holds === false ? "bug-reproduced" : "unconfirmed";
    case "candidate":
      if (checks.status === "passed") return Object.values(probes).every(({ holds }) => holds) ? "passed" : "unconfirmed";
      return checks.status === "assertion-failed" ? "caught" : checks.status;
  }
}
