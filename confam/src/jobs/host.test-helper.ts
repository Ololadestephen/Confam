import path from "node:path";
import { ProjectRegistry } from "../project/registry.js";
import { OnboardingService } from "../onboarding/service.js";
import { ExecutionManager } from "./manager.js";
const [registryDirectory, runsDirectory, id, hash] = process.argv.slice(2);
if (!registryDirectory || !runsDirectory || !id || !hash)
  throw new Error("Missing fixture host inputs.");
const onboarding = new OnboardingService(
  new ProjectRegistry(registryDirectory),
  path.join(registryDirectory, "drafts"),
);
const manager = new ExecutionManager(
  onboarding,
  path.join(registryDirectory, "jobs"),
  runsDirectory,
);
void manager.start(id, hash).then(() => process.send?.({ started: true }));
process.on("message", () => undefined);
