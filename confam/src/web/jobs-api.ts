import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { ExecutionManager } from "../jobs/manager.js";
const inputSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("preview"),
    draftId: z.uuid(),
    candidate: z
      .strictObject({
        name: z.string().min(1).max(200),
        text: z
          .string()
          .min(1)
          .max(1024 * 1024),
      })
      .optional(),
  }),
  z.strictObject({
    action: z.literal("start"),
    id: z.uuid(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    approve: z.literal(true),
  }),
  z.strictObject({ action: z.literal("cancel"), id: z.uuid() }),
]);
async function readBody(request: IncomingMessage) {
  if (request.headers["content-type"] !== "application/json")
    throw new Error("Send application/json.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 2 * 1024 * 1024)
      throw new Error("Execution request exceeds 2MiB.");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Execution request must contain valid JSON.");
  }
}
export async function jobsApi(
  manager: ExecutionManager,
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
      const draft = url.searchParams.get("draft");
      if (draft) send(200, { jobs: await manager.list(draft) });
      else
        send(200, {
          job: await manager.get(z.uuid().parse(url.searchParams.get("id"))),
        });
      return;
    }
    const input = inputSchema.parse(await readBody(request));
    const job =
      input.action === "preview"
        ? await manager.prepare(input.draftId, input.candidate)
        : input.action === "start"
          ? await manager.start(input.id, input.hash)
          : await manager.cancel(input.id);
    send(200, { job });
  } catch (error) {
    send(400, {
      error:
        error instanceof z.ZodError
          ? "Invalid execution request or saved job."
          : error instanceof Error
            ? error.message
            : "Execution request failed.",
    });
  }
}
