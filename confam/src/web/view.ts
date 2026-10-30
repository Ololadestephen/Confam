import path from "node:path";
import { readFile, readdir, lstat } from "node:fs/promises";
import { ArtifactRegistry, boundedJson, redact } from "./artifacts.js";

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function text(value: unknown, fallback = "Not recorded"): string {
  return typeof value === "string" ? value : fallback;
}
export class RunView {
  artifacts: ArtifactRegistry;
  constructor(
    readonly directory: string,
    token: string,
  ) {
    this.artifacts = new ArtifactRegistry(directory, token);
  }
  private async source() {
    for (const filename of [
      "challenge-report.json",
      "verification.json",
      "manifest.json",
      "recording-intake.json",
    ]) {
      try {
        return {
          filename,
          report: object(
            await boundedJson(path.join(this.directory, filename)),
          ),
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    throw new Error("No supported run report in the selected directory.");
  }
  // Comparisons written by `compare` into this run's own evaluations folder. Held-out results are also
  // promoted into the run report; known-fault comparisons exist only here.
  private async comparisons() {
    const root = path.join(this.directory, "evaluations");
    let names: string[];
    try {
      // A symlinked evaluations folder could point outside the run; only a real directory is read.
      if (!(await lstat(root)).isDirectory()) return [];
      names = await readdir(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const found = [];
    for (const name of names.sort()) {
      const file = path.join(root, name, "comparison.json");
      try {
        if (!(await lstat(path.join(root, name))).isDirectory() || !(await lstat(file)).isFile()) continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      let report: ObjectValue;
      try {
        report = object(await boundedJson(file));
      } catch {
        continue; // An unreadable comparison must not take down the rest of the run view.
      }
      if (report.status !== "completed") continue;
      const purpose = text(report.purpose);
      await this.artifacts.add(file, purpose === "held-out" ? "Held-out comparison" : "Known-fault comparison");
      found.push({
        purpose,
        arms: array(report.arms).map((value) => {
          const arm = object(value);
          const counts = object(arm.counts);
          const count = (key: string) => (typeof counts[key] === "number" ? counts[key] : 0);
          return {
            role: text(arm.role),
            provenance: text(arm.provenance, ""),
            counts: { total: count("total"), caught: count("caught"), survived: count("survived"), uncounted: count("uncounted") },
            falseRejections: typeof arm.falseRejections === "number" ? arm.falseRejections : 0,
            controlErrors: typeof arm.controlErrors === "number" ? arm.controlErrors : 0,
            controls: array(arm.controls).length,
            provenanceVerified: arm.provenanceVerified === true,
          };
        }),
      });
    }
    return found;
  }
  private async variants(report: ObjectValue) {
    const records: { value: ObjectValue; kind?: string; outcome?: string }[] =
      [];
    if (Array.isArray(report.variants))
      for (const item of report.variants) records.push({ value: object(item) });
    else {
      const versions = array(object(report.versions).versions);
      const last = object(versions.at(-1));
      const results = object(last.results);
      if (results.original)
        records.push({ value: object(results.original), kind: "original" });
      for (const item of array(results.controls))
        records.push({ value: object(item), kind: "control" });
      for (const item of array(results.decoys)) {
        const decoy = object(item);
        records.push({
          value: object(decoy.variant),
          kind: "development",
          outcome: text(decoy.outcome),
        });
      }
      const candidate = object(report.candidate);
      if (candidate.variant)
        records.push({
          value: object(candidate.variant),
          kind: "candidate",
          outcome: text(candidate.outcome),
        });
    }
    const variants = [];
    for (const { value, kind, outcome } of records) {
      const checks = object(value.result ?? value.checks);
      const id = text(value.id, "variant");
      const links = async (items: unknown[], label: string) => {
        const result = [];
        for (let index = 0; index < items.length; index++) {
          const link = await this.artifacts.add(
            items[index],
            `${label} ${index + 1}`,
          );
          if (link) result.push(link);
        }
        return result;
      };
      const videos = await links(array(checks.videos), "Recording");
      const traces = await links(
        Array.isArray(checks.traces)
          ? checks.traces
          : checks.trace
            ? [checks.trace]
            : [],
        "Playwright trace",
      );
      // Only evidence-adjacent logs for an explicitly listed variant are eligible.
      const evidence = text(checks.trace, "");
      const logs = evidence
        ? ((await this.artifacts.add(
            path.join(path.dirname(path.dirname(evidence)), "runtime.log"),
            "Runtime log",
          )) ??
          (await this.artifacts.add(
            path.join(path.dirname(path.dirname(evidence)), "server.log"),
            "Server log",
          )))
        : undefined;
      variants.push({
        id,
        kind: kind ?? text(value.kind, "variant"),
        outcome: outcome ?? text(value.outcome ?? checks.status),
        expectationId: checks.expectationId,
        assertions: array(checks.assertions),
        probes: object(value.probes),
        steps: array(checks.steps),
        videos,
        traces,
        logs,
        error: value.error ?? checks.error,
        viewingSlowMoMs: typeof checks.viewingSlowMoMs === "number" ? checks.viewingSlowMoMs : undefined,
      });
    }
    return variants;
  }
  private async expectations(report: ObjectValue) {
    const checks = object(object(report.seal).checks ?? report.checks);
    const directory =
      typeof checks.directory === "string" ? checks.directory : undefined;
    if (!directory) return [];
    const entry =
      (await this.artifacts.add(
        path.join(directory, "confirmation.json"),
        "Confirmed expectations",
      )) ??
      (await this.artifacts.add(
        path.join(this.directory, "confirmed.json"),
        "Confirmed expectations",
      ));
    if (!entry) return [];
    const id = new URL(entry.url, "http://localhost").pathname
      .split("/")
      .at(-1)!;
    const file = await this.artifacts.resolve(id);
    const confirmation = object(await boundedJson(file.file));
    return array(confirmation.expectations).map((item) => {
      const expectation = object(item);
      return {
        id: text(expectation.id),
        statement: text(expectation.statement ?? expectation.text),
      };
    });
  }
  private async build() {
    const { filename, report } = await this.source();
    const variants = await this.variants(report);
    const expectations = await this.expectations(report);
    const checks = object(object(report.seal).checks ?? report.checks);
    const reportFile =
      typeof checks.directory === "string"
        ? path.join(checks.directory, "report.md")
        : filename === "recording-intake.json"
          ? report.report
          : undefined;
    const reportLink = await this.artifacts.add(reportFile, "Input report");
    let inputReport: string | undefined;
    if (reportLink) {
      const id = new URL(reportLink.url, "http://localhost").pathname
        .split("/")
        .at(-1)!;
      const artifact = await this.artifacts.resolve(id);
      if ((await lstat(artifact.file)).size <= 65536)
        inputReport = await readFile(artifact.file, "utf8");
    }
    const candidate = variants.find(({ kind }) => kind === "candidate");
    if (candidate) {
      const patch = await this.artifacts.add(
        path.join(this.directory, "candidate.patch"),
        "Candidate patch",
      );
      if (patch) Object.assign(candidate, { patch });
    }
    await this.artifacts.add(path.join(this.directory, filename), "Run report");
    const independent = object(report.independentEvaluation ?? report.heldOut);
    const recordingInfo = object(report.recording);
    const recording = await this.artifacts.add(
      recordingInfo.artifact ?? recordingInfo.path,
      "Input recording",
    );
    let proposal: ObjectValue = {};
    if (typeof report.proposal === "string") {
      const link = await this.artifacts.add(
        report.proposal,
        "Recording observations",
      );
      if (link) {
        const artifact = this.artifacts.entries.get(
          new URL(link.url, "http://localhost").pathname.split("/").at(-1)!,
        );
        if (artifact) proposal = object(await boundedJson(artifact.file));
      }
    }
    const fixture =
      report.confirmation === "fixture" ||
      object(report.provenance).mode === "fixture" ||
      report.mode === "fixture";
    return {
      schemaVersion: 1,
      runId: path.basename(this.directory),
      project: text(report.project, "Recorded application"),
      caseId: text(report.caseId ?? report.case, "Recording intake"),
      status: text(report.status),
      verdict: text(
        report.verdict,
        filename === "recording-intake.json"
          ? "Recording observations require review; expectations are not confirmed."
          : "No verdict recorded.",
      ),
      freezeHash: typeof checks.sha256 === "string" ? checks.sha256 : undefined,
      durationMs: report.durationMs,
      inputReport: redact(inputReport),
      fixture,
      confirmation: report.confirmation,
      expectations: redact(expectations),
      variants: variants.map((variant) => ({
        ...variant,
        assertions: redact(variant.assertions),
        probes: redact(variant.probes),
        steps: redact(variant.steps),
        error: redact(variant.error),
      })),
      limitations: [
        ...array(report.limitations),
        ...(typeof report.reason === "string" ? [report.reason] : []),
        ...(fixture
          ? ["Scripted fixture inputs; inspect the evidence and scope."]
          : []),
      ],
      development: report.development,
      independent: {
        evaluated: independent.evaluated === true,
        complete: independent.complete,
        counts:
          independent.counts ??
          (typeof independent.total === "number"
            ? {
                total: independent.total,
                caught: independent.caught,
                survived: independent.survived,
                uncounted: independent.uncounted,
              }
            : undefined),
        arms: independent.arms,
        label:
          independent.evaluated === true
            ? "Independent evaluation recorded; inspect its completeness and counts."
            : "Independent evaluation not performed.",
      },
      comparisons: redact(await this.comparisons()),
      modelUsage: redact(report.modelUsage),
      versions: redact(report.versions ?? report.checkVersions),
      recording,
      observations:
        typeof report.proposal === "string" ? redact(proposal) : undefined,
      files: [...this.artifacts.entries.values()].map(
        ({ url, label, kind }) => ({ url, label, kind }),
      ),
    };
  }
  async read() {
    const next = new RunView(this.directory, this.artifacts.token);
    const result = await next.build();
    this.artifacts = next.artifacts;
    return result;
  }
}
