import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { OnboardingService } from "../onboarding/service.js";
import { reportInputSchema } from "../onboarding/context.js";
import { reviewedRequirementsSchema } from "../onboarding/contracts.js";
import { workflowSchema } from "../workflows/schema.js";
const requestSchema = z.discriminatedUnion("action", [
  reportInputSchema.extend({ action: z.literal("preview") }),
  z.strictObject({ action: z.literal("repreview"), id: z.uuid() }),
  z.strictObject({ action: z.literal("review-proposal"), id: z.uuid() }),
  z.strictObject({
    action: z.literal("generate"),
    id: z.uuid(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    approve: z.literal(true),
  }),
  reviewedRequirementsSchema.extend({
    action: z.literal("workflow"),
    id: z.uuid(),
  }),
  z.strictObject({
    action: z.literal("confirm"),
    id: z.uuid(),
    workflow: workflowSchema,
  }),
]);
const MAX_REQUEST_BYTES = 15 * 1024 * 1024;
async function body(request: IncomingMessage) {
  if (request.headers["content-type"] !== "application/json")
    throw new Error("Send application/json.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_REQUEST_BYTES)
      throw new Error("Onboarding request exceeds 15MiB.");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request must contain valid JSON.");
  }
}
export async function onboardingApi(
  service: OnboardingService,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) {
  const send = (status: number, value: unknown) => {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(value));
  };
  try {
    if (request.method === "GET") {
      send(200, {
        session: await service.get(z.uuid().parse(url.searchParams.get("id"))),
      });
      return;
    }
    const input = requestSchema.parse(await body(request));
    let session;
    if (input.action === "preview") {
      const { action, ...report } = input;
      session = await service.prepare(report);
    } else if (input.action === "review-proposal")
      session = await service.reviewProposal(input.id);
    else if (input.action === "repreview")
      session = await service.repreview(input.id);
    else if (input.action === "generate")
      session = await service.generate(input.id, input.hash);
    else if (input.action === "workflow") {
      const { action, id, ...reviewed } = input;
      session = await service.workflow(id, reviewed);
    } else session = await service.confirm(input.id, input.workflow);
    send(200, { session });
  } catch (error) {
    send(400, {
      error:
        error instanceof z.ZodError
          ? "Invalid onboarding request or saved draft."
          : error instanceof Error
            ? error.message
            : "Could not prepare checks.",
    });
  }
}
