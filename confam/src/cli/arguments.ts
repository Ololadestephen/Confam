import { budgetNanounits } from "../models/config.js";

export const USAGE = `Commands:
  serve <run-or-library-directory> [--port PORT] (local evidence, onboarding and explicitly approved verification jobs)
  recording-intake <recording.mp4> --report report.md [--budget USD] (exports recording and report to Meta)
  draft-decoys <case.json> --project project.json --registry probes.json --reference control-id [--budget USD] [--preview] (exports corrected source and reviewed probes to Meta; --preview only writes the export)
  challenge <case.json> --project project.json --workflow workflow.json --manifest challenges.json (--accept | --fixture) [--candidate patch] [--strengthen --budget USD]
  compare <challenge-run-directory> --pack pack.json [--integration-fixture]
  verify <case.json> --project project.json --workflow workflow.json (--accept | --fixture) [--candidate patch]
  draft-workflow <case.json> --project project.json [--budget USD]  (sends report and source to Meta)
  draft-fix <case.json> --project project.json [--budget USD] [--preview] (sends report, expectations and configured source to Muse Wonder; --preview only writes the export)
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
  command: "serve" | "recording-intake" | "draft-decoys" | "draft-fix" | "challenge" | "compare" | "verify" | "draft-workflow" | "project-check" | "run" | "intake" | "confirm" | "execute" | "recheck" | "heldout" | "demo";
  subject: string;
  report?: string;
  port?: number;
  candidate?: string;
  budget?: number;
  answer?: "yes" | "no";
  fix: boolean;
  pack?: string;
  project?: string;
  workflow?: string;
  fixture: boolean;
  accept: boolean;
  manifest?: string;
  strengthen: boolean;
  integrationFixture: boolean;
  registry?: string;
  reference?: string;
  preview: boolean;
}

export function parseArguments(argv: string[]): CliArguments {
  const [command, subject, ...flags] = argv;
  if (!command || !["serve", "recording-intake", "draft-decoys", "draft-fix", "challenge", "compare", "verify", "draft-workflow", "project-check", "run", "intake", "confirm", "execute", "recheck", "heldout", "demo"].includes(command) || !subject || subject.startsWith("--")) throw new Error(USAGE);
  const values = new Map<string, string>();
  const allowed: Record<string, string[]> = {
    serve: ["--port"],
    "recording-intake": ["--report", "--budget"],
    "draft-decoys": ["--project", "--registry", "--reference", "--budget", "--preview"],
    challenge: ["--project", "--workflow", "--manifest", "--accept", "--fixture", "--candidate", "--strengthen", "--budget"],
    compare: ["--pack", "--integration-fixture"],
    verify: ["--project", "--workflow", "--accept", "--fixture", "--candidate"],
    "draft-workflow": ["--project", "--budget"],
    "draft-fix": ["--project", "--budget", "--preview"],
    "project-check": [], run: ["--candidate"], intake: ["--budget"], confirm: ["--accept", "--answer"], execute: ["--candidate", "--fix"], demo: ["--candidate", "--budget", "--fix"],
    recheck: ["--candidate", "--budget", "--fix"], heldout: ["--pack"],
  };
  for (let index = 0;index < flags.length;index += 1) {
    const flag = flags[index]!;
    if (!allowed[command]?.includes(flag) || values.has(flag)) throw new Error(`Invalid or duplicate option: ${flag}\n${USAGE}`);
    if (flag === "--accept" || flag === "--fix" || flag === "--fixture" || flag === "--strengthen" || flag === "--integration-fixture" || flag === "--preview") { values.set(flag, "yes"); continue; }
    const value = flags[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
  }
  if ((["draft-decoys", "draft-fix", "challenge", "verify", "draft-workflow"].includes(command)) && !values.has("--project")) throw new Error("A project configuration is required.");
  if ((command === "verify" || command === "challenge") && (!values.has("--workflow") || values.has("--accept") === values.has("--fixture"))) {
    throw new Error("Review the case and workflow, then choose --accept or explicitly labelled --fixture confirmation.");
  }
  if (command === "draft-decoys" && (!values.has("--registry") || !values.has("--reference"))) throw new Error("Decoy drafting requires reviewed --registry and --reference control.");
  if (command === "challenge" && !values.has("--manifest")) throw new Error("Challenge runs require an explicit reviewed --manifest.");
  if (command === "challenge" && values.has("--budget") && !values.has("--strengthen")) throw new Error("--budget requires --strengthen.");
  if (values.has("--strengthen") && values.has("--fixture")) throw new Error("Live model strengthening requires developer confirmation, not scripted --fixture mode.");
  if (command === "compare" && !values.has("--pack")) throw new Error("Comparison requires an explicit --pack path.");
  if (command === "confirm" && !values.has("--accept")) throw new Error("Review intake.json, then pass --accept to confirm its expectations.");
  if (command === "heldout" && !values.has("--pack")) throw new Error("Held-out evaluation requires an explicit --pack path.");
  if (values.has("--fix") && values.has("--candidate")) throw new Error("Choose --fix or --candidate, not both.");
  if (command === "recording-intake" && !values.has("--report")) throw new Error("Recording intake requires a written --report.");
  const port = values.has("--port") ? Number(values.get("--port")) : undefined;
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error("--port must be an integer from 0 to 65535.");
  const budget = values.has("--budget") ? Number(values.get("--budget")) : undefined;
  if (budget !== undefined) budgetNanounits(budget);
  const answer = values.get("--answer");
  if (answer !== undefined && answer !== "yes" && answer !== "no") throw new Error("--answer must be yes or no.");
  return {
    command: command as CliArguments["command"], subject, report: values.get("--report"), port, candidate: values.get("--candidate"), budget, answer, fix: values.has("--fix"), pack: values.get("--pack"),
    project: values.get("--project"), workflow: values.get("--workflow"), fixture: values.has("--fixture"), accept: values.has("--accept"), manifest: values.get("--manifest"), strengthen: values.has("--strengthen"), integrationFixture: values.has("--integration-fixture"), registry: values.get("--registry"), reference: values.get("--reference"), preview: values.has("--preview")
  };
}
