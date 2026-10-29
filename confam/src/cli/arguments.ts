import { budgetNanounits } from "../models/config.js";

export const USAGE = `Commands:
  verify <case.json> --project project.json --workflow workflow.json (--accept | --fixture) [--candidate patch]
  draft-workflow <case.json> --project project.json [--budget USD]  (sends report and source to Meta)
  project-check <project.json>
  run <case> [--candidate patch]
  intake <case> [--budget USD]
  confirm <session-id> --accept [--answer yes|no]
  execute <session-id> [--candidate patch | --fix]
  recheck <completed-session-id> [--budget USD] [--candidate patch | --fix]
  heldout <completed-session-id> --pack evaluation-pack.json
  demo <case> [--budget USD] [--candidate patch | --fix]
The demo uses scripted fixture responses and confirmation; it makes no model calls.`;

interface CliArguments {
  command: "verify" | "draft-workflow" | "project-check" | "run" | "intake" | "confirm" | "execute" | "recheck" | "heldout" | "demo";
  subject: string;
  candidate?: string;
  budget?: number;
  answer?: "yes" | "no";
  fix: boolean;
  pack?: string;
  project?: string;
  workflow?: string;
  fixture: boolean;
  accept: boolean;
}

export function parseArguments(argv: string[]): CliArguments {
  const [command, subject, ...flags] = argv;
  if (!command || !["verify", "draft-workflow", "project-check", "run", "intake", "confirm", "execute", "recheck", "heldout", "demo"].includes(command) || !subject || subject.startsWith("--")) throw new Error(USAGE);
  const values = new Map<string, string>();
  const allowed: Record<string, string[]> = {
    verify: ["--project", "--workflow", "--accept", "--fixture", "--candidate"],
    "draft-workflow": ["--project", "--budget"],
    "project-check": [], run: ["--candidate"], intake: ["--budget"], confirm: ["--accept", "--answer"], execute: ["--candidate", "--fix"], demo: ["--candidate", "--budget", "--fix"],
    recheck: ["--candidate", "--budget", "--fix"], heldout: ["--pack"],
  };
  for (let index = 0;index < flags.length;index += 1) {
    const flag = flags[index]!;
    if (!allowed[command]?.includes(flag) || values.has(flag)) throw new Error(`Invalid or duplicate option: ${flag}\n${USAGE}`);
    if (flag === "--accept" || flag === "--fix" || flag === "--fixture") { values.set(flag, "yes"); continue; }
    const value = flags[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
  }
  if ((command === "verify" || command === "draft-workflow") && !values.has("--project")) throw new Error("A project configuration is required.");
  if (command === "verify" && (!values.has("--workflow") || values.has("--accept") === values.has("--fixture"))) {
    throw new Error("Review the case and workflow, then choose --accept or explicitly labelled --fixture confirmation.");
  }
  if (command === "confirm" && !values.has("--accept")) throw new Error("Review intake.json, then pass --accept to confirm its expectations.");
  if (command === "heldout" && !values.has("--pack")) throw new Error("Held-out evaluation requires an explicit --pack path.");
  if (values.has("--fix") && values.has("--candidate")) throw new Error("Choose --fix or --candidate, not both.");
  const budget = values.has("--budget") ? Number(values.get("--budget")) : undefined;
  if (budget !== undefined) budgetNanounits(budget);
  const answer = values.get("--answer");
  if (answer !== undefined && answer !== "yes" && answer !== "no") throw new Error("--answer must be yes or no.");
  return {
    command: command as CliArguments["command"], subject, candidate: values.get("--candidate"), budget, answer, fix: values.has("--fix"), pack: values.get("--pack"),
    project: values.get("--project"), workflow: values.get("--workflow"), fixture: values.has("--fixture"), accept: values.has("--accept")
  };
}
