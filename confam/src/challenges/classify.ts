import type { EvaluatedVariant } from "../project/verify.js";
import type { Decoy } from "./schema.js";
export type ChallengeOutcome = "caught" | "survived" | "invalid" | "unreached" | "timeout" | "execution-error" | "unconfirmed" | "unrelated-assertion";
function confirmedViolation(decoy: Decoy, variant: EvaluatedVariant): boolean {
  return decoy.requirements.some(({ holds }) => holds === false) && decoy.requirements.every(({ probe, holds }) => {
    const observation = variant.probes?.[probe];
    return Boolean(observation) && !observation?.error && observation?.holds === holds;
  });
}
export function classifyChallenge(decoy: Decoy, variant: EvaluatedVariant): ChallengeOutcome {
  if (variant.error) return variant.phase === "prepare" ? "invalid" : "execution-error";
  const checks = variant.result;
  if (!checks) return "invalid";
  if (checks.status === "timeout" || checks.status === "execution-error") return checks.status;
  if (!checks.reached || checks.status === "unreached") return "unreached";
  if (!confirmedViolation(decoy, variant)) return "unconfirmed";
  if (checks.status === "passed") return "survived";
  return decoy.expectationIds.includes(checks.expectationId ?? "") ? "caught" : "unrelated-assertion";
}
export function countChallenges(outcomes: { outcome: ChallengeOutcome }[]) {
  const caught = outcomes.filter(({ outcome }) => outcome === "caught").length;
  const survived = outcomes.filter(({ outcome }) => outcome === "survived").length;
  return { total: outcomes.length, caught, survived, uncounted: outcomes.length - caught - survived };
}
