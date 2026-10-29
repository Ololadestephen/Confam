import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { ProjectRegistry } from "../project/registry.js";

const bodySchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("add"),
    root: z.string().min(1).max(4096),
  }),
  z.strictObject({ action: z.literal("refresh"), id: z.uuid() }),
  z.strictObject({
    action: z.literal("approve"),
    id: z.uuid(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);
async function readBody(request: IncomingMessage): Promise<unknown> {
  if (request.headers["content-type"] !== "application/json")
    throw new Error("Send application/json.");
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 8192) throw new Error("Project request is too large.");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Project request must contain valid JSON.");
  }
}
export async function projectApi(
  registry: ProjectRegistry,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const send = (status: number, value: unknown) => {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(value));
  };
  try {
    if (request.method === "GET") {
      send(200, { projects: await registry.list() });
      return;
    }
    const body = bodySchema.parse(await readBody(request));
    const project =
      body.action === "add"
        ? await registry.add(body.root)
        : body.action === "refresh"
          ? await registry.refresh(body.id)
          : await registry.approve(body.id, body.revision);
    send(200, { project });
  } catch (error) {
    send(400, {
      error:
        error instanceof z.ZodError
          ? "Invalid project request."
          : error instanceof Error
            ? error.message
            : "Could not save the project.",
    });
  }
}
