import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A seal is usable only with the same trusted implementation and dependency identity.
export async function engineIdentity(): Promise<string> {
  const source = fileURLToPath(new URL("..", import.meta.url));
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) files.push(file);
    }
  }
  await visit(source);
  files.push(path.join(root, "package.json"), path.join(root, "package-lock.json"));
  const hash = createHash("sha256").update(process.version);
  for (const file of files.sort((a, b) => a < b ? -1 : a > b ? 1 : 0)) {
    const bytes = await readFile(file);
    hash.update(JSON.stringify([path.relative(root, file), bytes.length])).update(bytes);
  }
  return hash.digest("hex");
}
