import { readFile } from "node:fs/promises";

export async function readJson<T = unknown>(file: string): Promise<T> {
  const contents = await readFile(file, "utf8");
  try {
    return JSON.parse(contents) as T;
  } catch (cause) {
    throw new Error(`Invalid JSON in ${file}`, { cause });
  }
}
