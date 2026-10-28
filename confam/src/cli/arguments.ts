import { budgetNanounits } from "../models/config.js";

export const USAGE = `Commands:
  run <case> [--candidate patch]
  intake <case> [--budget USD]
  confirm <session-id> --accept [--answer yes|no]
  execute <session-id> [--candidate patch | --fix]
  recheck <completed-session-id> [--budget USD] [--candidate patch | --fix]
  heldout <completed-session-id> --pack evaluation-pack.json
  demo <case> [--budget USD] [--candidate patch | --fix]
The demo uses scripted fixture responses and confirmation; it makes no model calls.`;

interface CliArguments {
  command: "run" | "intake" | "confirm" | "execute" | "recheck" | "heldout" | "demo";
  subject: string;
  candidate?: string;
  budget?: number;
  answer?: "yes" | "no";
  fix: boolean;
  pack?: string;
}

export function parseArguments(argv: string[]): CliArguments {
  const [command, subject, ...flags] = argv;
  if (!command || !["run", "intake", "confirm", "execute", "recheck", "heldout", "demo"].includes(command) || !subject || subject.startsWith("--")) throw new Error(USAGE);
  const values = new Map<string, string>();
  const allowed: Record<string, string[]> = {
    run: ["--candidate"], intake: ["--budget"], confirm: ["--accept", "--answer"], execute: ["--candidate", "--fix"], demo: ["--candidate", "--budget", "--fix"],
    recheck: ["--candidate", "--budget", "--fix"], heldout: ["--pack"],
  };
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index]!;
    if (!allowed[command]?.includes(flag) || values.has(flag)) throw new Error(`Invalid or duplicate option: ${flag}\n${USAGE}`);
    if (flag === "--accept" || flag === "--fix") { values.set(flag, "yes"); continue; }
    const value = flags[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
  }
  if (command === "confirm" && !values.has("--accept")) throw new Error("Review intake.json, then pass --accept to confirm its expectations.");
  if (command === "heldout" && !values.has("--pack")) throw new Error("Held-out evaluation requires an explicit --pack path.");
  if (values.has("--fix") && values.has("--candidate")) throw new Error("Choose --fix or --candidate, not both.");
  const budget = values.has("--budget") ? Number(values.get("--budget")) : undefined;
  if (budget !== undefined) budgetNanounits(budget);
  const answer = values.get("--answer");
  if (answer !== undefined && answer !== "yes" && answer !== "no") throw new Error("--answer must be yes or no.");
  return { command: command as CliArguments["command"], subject, candidate: values.get("--candidate"), budget, answer, fix: values.has("--fix"), pack: values.get("--pack") };
}
