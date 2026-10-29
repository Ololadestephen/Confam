export interface DraftFields {
  projectId: string;
  caseId: string;
  report: string;
  expectations: string;
  fixtures: string;
  projectPath: string;
  casePath: string;
  workflowPath: string;
  candidatePath: string;
}
export const initialDraft: DraftFields = {
  projectId: "",
  caseId: "",
  report: "",
  expectations: "",
  fixtures: "{}",
  projectPath: "project.json",
  casePath: "case.json",
  workflowPath: "workflow.json",
  candidatePath: "",
};
export function shellQuote(value: string) {
  return "'" + value.replace(/'/g, "'\"'\"'") + "'";
}
export function prepareDraft(fields: DraftFields) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(fields.projectId))
    throw Error(
      "Use a lowercase project ID with letters, numbers, or hyphens.",
    );
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(fields.caseId))
    throw Error(
      "Start the case ID with a letter; use letters, numbers, underscores, or hyphens.",
    );
  if (
    !fields.report.trim() ||
    new TextEncoder().encode(fields.report).length > 65536
  )
    throw Error("Add a written report of at most 64KiB.");
  const statements = fields.expectations
    .split("\n")
    .map((value) => value.trim());
  const empty = statements.findIndex((value) => !value);
  if (empty !== -1) throw Error(`Expectation ${empty + 1} is empty.`);
  if (!statements.length || statements.some((value) => value.length > 2000))
    throw Error(
      "Add at least one expectation, with no more than 2,000 characters per line.",
    );
  let fixtures: unknown;
  try {
    fixtures = JSON.parse(fields.fixtures);
  } catch {
    throw Error("Fixtures must be valid JSON.");
  }
  if (!fixtures || typeof fixtures !== "object" || Array.isArray(fixtures))
    throw Error("Fixtures must be a JSON object.");
  if (
    ![fields.projectPath, fields.casePath, fields.workflowPath].every((value) =>
      value.trim(),
    )
  )
    throw Error("Provide project, case, and workflow file paths.");
  const expectations = statements.map((statement, index) => ({
    id: `E${index + 1}`,
    statement,
    provenance: "developer" as const,
  }));
  const definition = {
    schemaVersion: 1,
    id: fields.caseId,
    projectId: fields.projectId,
    report: "report.md",
    fixtures,
    expectations,
    reproductionTargets: [expectations[0]!.id],
    controls: [],
    mode: "verification",
    purpose: "verification",
  };
  const command = `npm run confam -- verify ${shellQuote(fields.casePath)} --project ${shellQuote(fields.projectPath)} --workflow ${shellQuote(fields.workflowPath)} --accept${fields.candidatePath.trim() ? " --candidate " + shellQuote(fields.candidatePath) : ""}`;
  return { definition, command };
}
export function downloadText(
  filename: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
