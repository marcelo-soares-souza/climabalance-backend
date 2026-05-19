import { getLogger } from "../utils/logger";
import { buildLogContext } from "./log-context";
import type { HttpContext } from "./router";
import { parseContentLength, summarizeBodyForLog } from "./log-summary";

export function getRequestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

export async function parseJson(
  request: Request,
  ctx?: HttpContext,
  maxBytes = 1024 * 64,
): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("invalid_content_type");
  }
  const reader = request.body?.getReader();
  if (!reader) return logPayload({}, request, ctx);

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        throw new Error("payload_too_large");
      }
      chunks.push(value);
    }
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length === 0) return logPayload({}, request, ctx);
  const parsed = JSON.parse(buffer.toString("utf-8"));
  return logPayload(parsed, request, ctx);
}

function logPayload(
  payload: unknown,
  request: Request,
  ctx?: HttpContext,
): unknown {
  if (!ctx) return payload;
  const url = new URL(request.url);
  const metadata = {
    method: request.method,
    path: url.pathname,
    route: ctx.routePath,
    content_type: request.headers.get("content-type") ?? undefined,
    content_length: parseContentLength(request.headers.get("content-length")),
    body_summary: summarizeBodyForLog(payload),
  };
  getLogger(buildLogContext(ctx)).debug("request.body_parsed", metadata);
  return payload;
}
