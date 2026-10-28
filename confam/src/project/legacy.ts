import { fileURLToPath } from "node:url";
import { loadProjectConfig } from "./config.js";

// Compatibility boundary for pre-configuration commands and historical runs.
// New projects provide their own configuration; no domain policy belongs in the engine.
export async function legacyProjectConfig() {
  return (await loadProjectConfig(fileURLToPath(new URL("../../../specimens/salon/project.json", import.meta.url)))).config;
}
