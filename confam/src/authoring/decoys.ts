import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VariantSpec } from "../engine/contracts.js";
import { git } from "../engine/process.js";
import { createVariant, guardPatch } from "../engine/variants.js";
import { APP_FILES, validateDecoyDraft, type DecoyDraft } from "./schemas.js";

export async function sourceBundle(app: string): Promise<Record<string, string>> {
  const files = await Promise.all(APP_FILES.map(async (file) => [file, await readFile(path.join(app, file), "utf8")] as const));
  return Object.fromEntries(files);
}

export async function materializeDecoys(baseline: string, runDirectory: string, draft: DecoyDraft, trustedT4Patch: string): Promise<VariantSpec[]> {
  validateDecoyDraft(draft);
  const variants: VariantSpec[] = [];
  for (const decoy of draft.decoys) {
    const id = `generated-${decoy.category.toLowerCase()}`;
    const directory = path.join(runDirectory, "generation", id);
    await createVariant(baseline, directory, decoy.category === "T4" ? trustedT4Patch : undefined);
    for (const edit of decoy.edits) {
      const file = path.join(directory, edit.file);
      const contents = await readFile(file, "utf8");
      const index = contents.indexOf(edit.before);
      if (index < 0 || contents.indexOf(edit.before, index + 1) >= 0) throw new Error(`Generated edit for ${id}/${edit.file} is absent or ambiguous.`);
      await writeFile(file, contents.slice(0, index) + edit.after + contents.slice(index + edit.before.length));
    }
    const patch = path.join(runDirectory, `${id}-draft.patch`);
    await writeFile(patch, await git(directory, "diff", "--"));
    await guardPatch(baseline, patch);
    variants.push({
      id, kind: "development", patch, violation: decoy.violation, requirements: decoy.requirements,
      patchSource: decoy.category === "T4" ? "curated-mutation" : "model-edits",
      serverErrorIncludes: decoy.category === "T4" ? "Could not save appointment:" : undefined,
    });
  }
  return variants;
}
