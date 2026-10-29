import { loadExecutionInputs } from "./execution.js";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  draftRequirements,
  draftReviewedWorkflow,
} from "../authoring/onboarding.js";
import {
  ModelClient,
  createMetaTransport,
  type ModelTransport,
} from "../models/client.js";
import { CostLedger } from "../models/ledger.js";
import { DEFAULT_BUDGET_USD } from "../models/config.js";
import { ProjectRegistry } from "../project/registry.js";
import { validateWorkflow, workflowSchema } from "../workflows/schema.js";
import { MAX_RECORDING_BYTES, validateMp4 } from "../recordings/mp4.js";
import { shellQuote } from "../web/client/draft.js";
import {
  reviewedRequirementsSchema,
  type OnboardingSession,
} from "./contracts.js";
import { DraftStorage, boundedText, writePrivate } from "./storage.js";
import { storedDraftSchema, type StoredDraft } from "./state.js";
import {
  MAX_CONTEXT_BYTES,
  reportInputSchema,
  hash,
  sourceContext,
  definition,
  preview,
} from "./context.js";

export class OnboardingService {
  private readonly storage: DraftStorage<StoredDraft>;
  private readonly active = new Set<string>();
  constructor(
    private readonly registry: ProjectRegistry,
    directory: string,
    private readonly injected?: ModelTransport,
  ) {
    this.storage = new DraftStorage(directory, storedDraftSchema);
  }
  private async current(draft: StoredDraft) {
    const project = await this.registry.refresh(draft.session.projectId);
    if (
      project.revision !== draft.projectRevision ||
      project.approvedRevision !== project.revision ||
      project.detection.configPath !== draft.configPath
    )
      throw new Error(
        "Project setup changed. Review it and start a new report.",
      );
    const current = await sourceContext(draft.configPath);
    if (
      hash(current.source) !== draft.sourceHash ||
      hash(current.config) !== hash(draft.config)
    )
      throw new Error(
        "Application source changed. Start a new report and review the new export.",
      );
  }
  async prepare(input: unknown): Promise<OnboardingSession> {
    const report = reportInputSchema.parse(input);
    if (Buffer.byteLength(report.report) > 65536)
      throw new Error("Report exceeds 64KiB.");
    const project = await this.registry.refresh(report.projectId);
    if (
      project.approvedRevision !== project.revision ||
      !project.detection.configPath
    )
      throw new Error(
        "Review a valid Confam project configuration in Apps first.",
      );
    const context = await sourceContext(project.detection.configPath);
    const id = randomUUID();
    const draft: StoredDraft = {
      session: {
        id,
        projectId: project.id,
        projectName: project.name,
        caseId: report.caseId,
        report: report.report,
        mode: this.injected?.mode ?? "live",
        status: "export-review",
        phase: "intake",
      },
      projectRevision: project.revision,
      configPath: project.detection.configPath,
      ...context,
      sourceHash: hash(context.source),
    };
    if (report.recording) {
      const bytes = Buffer.from(report.recording.dataBase64, "base64");
      if (
        bytes.length > MAX_RECORDING_BYTES ||
        bytes.toString("base64") !== report.recording.dataBase64
      )
        throw new Error(
          "Recording must contain canonical base64 for an MP4 up to 10MiB.",
        );
      const metadata = validateMp4(bytes);
      draft.videoBase64 = report.recording.dataBase64;
      draft.recording = {
        name: report.recording.name,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
        durationSeconds: metadata.durationSeconds,
      };
    }
    draft.session.preview = preview(draft, {
      report: report.report,
      source: context.source,
      capabilities: { restart: context.config.runtime.restart },
      ...(draft.recording ? { recording: draft.recording } : {}),
    });
    const folder = await this.storage.folder(id);
    await writePrivate(
      path.join(folder, "export-intake.json"),
      JSON.stringify(draft.session.preview, null, 2),
    );
    if (draft.videoBase64)
      await writePrivate(
        path.join(folder, "recording.mp4"),
        Buffer.from(draft.videoBase64, "base64"),
      );
    await CostLedger.create(
      path.join(folder, "model-usage.json"),
      DEFAULT_BUDGET_USD,
      draft.session.mode,
    );
    await writePrivate(
      path.join(folder, `export-intake-${draft.session.preview.hash}.json`),
      JSON.stringify(draft.session.preview, null, 2),
    );
    await this.storage.write(id, draft);
    return draft.session;
  }
  async get(id: string): Promise<OnboardingSession> {
    return this.storage.locked(id, async () => {
      const draft = await this.storage.read(id);
      if (draft.session.status === "generating" && !this.active.has(id)) {
        draft.session.status = "error";
        draft.session.error =
          "Authoring was interrupted. No automatic retry was sent. Start a new report after checking the saved usage ledger.";
        draft.session.usage = (
          await CostLedger.load(
            path.join(await this.storage.folder(id), "model-usage.json"),
          )
        ).snapshot();
        await this.storage.write(id, draft);
      }
      return draft.session;
    });
  }
  async generate(id: string, digest: string): Promise<OnboardingSession> {
    return this.storage.locked(id, async () => {
      const draft = await this.storage.read(id);
      if (
        draft.session.status !== "export-review" ||
        draft.session.preview?.hash !== digest
      )
        throw new Error(
          "Review the current export before sending it. This approval cannot be reused.",
        );
      await this.current(draft);
      const exportPreview = draft.session.preview;
      if (hash({ ...exportPreview, hash: undefined }) !== digest)
        throw new Error("Saved export changed; nothing was sent.");
      let originalInput: unknown;
      try {
        originalInput = JSON.parse(exportPreview.payload.input);
      } catch {
        throw new Error("Saved export is invalid.");
      }
      if (
        preview(draft, originalInput, exportPreview.approvalId).hash !== digest
      )
        throw new Error(
          "Authoring instructions changed. Prepare a new export.",
        );
      if (draft.videoBase64 && draft.recording) {
        const bytes = Buffer.from(draft.videoBase64, "base64");
        if (
          bytes.toString("base64") !== draft.videoBase64 ||
          bytes.length !== draft.recording.bytes ||
          validateMp4(bytes).durationSeconds !==
            draft.recording.durationSeconds ||
          createHash("sha256").update(bytes).digest("hex") !==
            draft.recording.sha256
        )
          throw new Error("Recording changed; nothing was sent.");
      }
      const transport =
        this.injected ?? createMetaTransport(process.env.MODEL_API_KEY ?? "");
      const ledger = await CostLedger.load(
        path.join(await this.storage.folder(id), "model-usage.json"),
      );
      const client = new ModelClient(ledger, transport);
      draft.session.status = "generating";
      await this.storage.write(id, draft);
      this.active.add(id);
      try {
        if (draft.session.phase === "intake") {
          const requirements = await draftRequirements(
            client,
            exportPreview.payload.input,
            draft.videoBase64
              ? { dataUrl: `data:video/mp4;base64,${draft.videoBase64}` }
              : undefined,
          );
          const ids = requirements.expectations.map((item) => item.id);
          if (new Set(ids).size !== ids.length)
            throw new Error(
              "Suggested requirements contain duplicate IDs. No checks were accepted.",
            );
          for (const observation of requirements.observations)
            if (
              !draft.recording ||
              observation.timestampSeconds > draft.recording.durationSeconds
            )
              throw new Error(
                "Recording observation is not grounded within the supplied clip.",
              );
          await writePrivate(
            path.join(
              await this.storage.folder(id),
              "requirements-proposal.json",
            ),
            JSON.stringify(requirements, null, 2),
          );
          draft.session.requirements = requirements;
          draft.session.status = "requirements-review";
        } else {
          const proposed = await draftReviewedWorkflow(
            client,
            exportPreview.payload.input,
          );
          await writePrivate(
            path.join(await this.storage.folder(id), "workflow-proposal.json"),
            JSON.stringify(proposed, null, 2),
          );
          const reviewed = draft.session.reviewed!;
          draft.session.workflow = proposed;
          try {
            validateWorkflow(
              proposed,
              reviewed.expectations,
              reviewed.fixtures,
              draft.config.runtime,
            );
          } catch (error) {
            draft.session.error =
              error instanceof Error
                ? error.message
                : "Workflow needs correction.";
          }
          draft.session.status = "workflow-review";
        }
      } catch (error) {
        draft.session.status = "error";
        draft.session.error =
          error instanceof Error
            ? error.message
            : "Authoring failed. No automatic retry was sent.";
      } finally {
        draft.session.usage = ledger.snapshot();
        await writePrivate(
          path.join(
            await this.storage.folder(id),
            `attempt-${draft.session.phase}-${digest}.json`,
          ),
          JSON.stringify(
            {
              status: draft.session.status,
              error: draft.session.error,
              requirements: draft.session.requirements,
              workflow: draft.session.workflow,
              usage: ledger.snapshot(),
            },
            null,
            2,
          ),
        );
        this.active.delete(id);
        await this.storage.write(id, draft);
      }
      return draft.session;
    });
  }
  async workflow(id: string, input: unknown): Promise<OnboardingSession> {
    return this.storage.locked(id, async () => {
      const draft = await this.storage.read(id);
      if (draft.session.status !== "requirements-review")
        throw new Error("Review the suggested requirements first.");
      await this.current(draft);
      const reviewed = reviewedRequirementsSchema.parse(input);
      const questions = draft.session.requirements!.questions;
      if (
        questions.length !== reviewed.answers.length ||
        questions.some(
          (question, index) => reviewed.answers[index]?.question !== question,
        )
      )
        throw new Error(
          "Answer every clarification before proposing a workflow.",
        );
      definition(draft, reviewed);
      draft.session.reviewed = reviewed;
      draft.session.phase = "checks";
      draft.session.preview = preview(draft, {
        report: draft.session.report,
        expectations: reviewed.expectations,
        fixtures: reviewed.fixtures,
        clarifications: reviewed.answers,
        reproductionTargets: reviewed.reproductionTargets,
        capabilities: { restart: draft.config.runtime.restart },
        source: draft.source,
      });
      draft.session.status = "export-review";
      const folder = await this.storage.folder(id);
      await writePrivate(
        path.join(folder, "reviewed-requirements.json"),
        JSON.stringify(reviewed, null, 2),
      );
      await writePrivate(
        path.join(folder, "export-checks.json"),
        JSON.stringify(draft.session.preview, null, 2),
      );
      await this.storage.write(id, draft);
      return draft.session;
    });
  }
  async repreview(id: string): Promise<OnboardingSession> {
    return this.storage.locked(id, async () => {
      const draft = await this.storage.read(id);
      if (draft.session.status !== "error")
        throw new Error("Only a failed proposal can prepare a new export.");
      await this.current(draft);
      const folder = await this.storage.folder(id);
      const ledger = await CostLedger.load(
        path.join(folder, "model-usage.json"),
      );
      if (ledger.snapshot().hasUncertainUsage)
        throw new Error(
          "Usage is uncertain; another model request is blocked.",
        );
      if (draft.session.preview)
        await writePrivate(
          path.join(
            folder,
            `export-${draft.session.phase}-${draft.session.preview.hash}.json`,
          ),
          JSON.stringify(draft.session.preview, null, 2),
        );
      const reviewed = draft.session.reviewed;
      const input =
        draft.session.phase === "intake"
          ? {
              report: draft.session.report,
              source: draft.source,
              capabilities: { restart: draft.config.runtime.restart },
              ...(draft.recording ? { recording: draft.recording } : {}),
            }
          : {
              report: draft.session.report,
              expectations: reviewed!.expectations,
              fixtures: reviewed!.fixtures,
              clarifications: reviewed!.answers,
              reproductionTargets: reviewed!.reproductionTargets,
              capabilities: { restart: draft.config.runtime.restart },
              source: draft.source,
            };
      draft.session.preview = preview(draft, input);
      draft.session.status = "export-review";
      delete draft.session.error;
      await writePrivate(
        path.join(
          folder,
          `export-${draft.session.phase}-${draft.session.preview.hash}.json`,
        ),
        JSON.stringify(draft.session.preview, null, 2),
      );
      await this.storage.write(id, draft);
      return draft.session;
    });
  }
  async reviewProposal(id: string): Promise<OnboardingSession> {
    return this.storage.locked(id, async () => {
      const draft = await this.storage.read(id);
      if (draft.session.status !== "error" || draft.session.phase !== "checks")
        throw new Error("No failed workflow proposal is available for review.");
      await this.current(draft);
      let proposal: unknown;
      try {
        proposal = JSON.parse(
          await boundedText(
            path.join(await this.storage.folder(id), "workflow-proposal.json"),
            MAX_CONTEXT_BYTES,
          ),
        );
      } catch {
        throw new Error(
          "No saved workflow proposal is available. Prepare a new export or use manual setup.",
        );
      }
      draft.session.workflow = workflowSchema.parse(proposal);
      draft.session.status = "workflow-review";
      await this.storage.write(id, draft);
      return draft.session;
    });
  }
  async executionInputs(id: string) {
    return this.storage.locked(id, async () => {
      const draft = await this.storage.read(id);
      await this.current(draft);
      return loadExecutionInputs(draft, await this.storage.folder(id));
    });
  }
  async confirm(
    id: string,
    input: unknown,
    source: "developer-web" | "agent-cli" = "developer-web",
  ): Promise<OnboardingSession> {
    return this.storage.locked(id, async () => {
      const draft = await this.storage.read(id);
      if (draft.session.status !== "workflow-review")
        throw new Error("Review the workflow proposal before confirming.");
      await this.current(draft);
      const reviewed = draft.session.reviewed!;
      const workflow = validateWorkflow(
        input,
        reviewed.expectations,
        reviewed.fixtures,
        draft.config.runtime,
      );
      const folder = await this.storage.folder(id);
      const files = {
        case: path.join(folder, "case.json"),
        workflow: path.join(folder, "workflow.json"),
        report: path.join(folder, "report.md"),
        confirmation: path.join(folder, "confirmation.json"),
        command: "",
      };
      files.command = `npm run confam -- verify ${shellQuote(files.case)} --project ${shellQuote(draft.configPath)} --workflow ${shellQuote(files.workflow)} ${draft.session.mode === "fixture" ? "--fixture" : "--accept"}`;
      const caseData = definition(draft, reviewed);
      await writePrivate(files.case, JSON.stringify(caseData, null, 2));
      await writePrivate(files.workflow, JSON.stringify(workflow, null, 2));
      await writePrivate(files.report, draft.session.report);
      await writePrivate(
        files.confirmation,
        JSON.stringify(
          {
            schemaVersion: 1,
            source: draft.session.mode === "fixture" ? "fixture" : source,
            confirmedAt: new Date().toISOString(),
            draftId: id,
            caseHash: hash(caseData),
            workflowHash: hash(workflow),
            projectRevision: draft.projectRevision,
            sourceHash: draft.sourceHash,
            answers: reviewed.answers,
            scope:
              "Reviewed requirements and workflow only. No application execution or repair result.",
          },
          null,
          2,
        ),
      );
      draft.session.workflow = workflow;
      draft.session.status = "confirmed";
      delete draft.session.error;
      draft.session.files = files;
      await this.storage.write(id, draft);
      return draft.session;
    });
  }
}
