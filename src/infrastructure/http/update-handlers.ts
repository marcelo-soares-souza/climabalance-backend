import type { HttpContext } from "../../shared/http/router";
import { errorResponse, jsonResponse } from "../../shared/http/response";
import { logger } from "../../shared/utils/logger";
import { env } from "../../shared/utils/env";

// Global set to track SSE clients
const sseClients = new Set<ReadableStreamDefaultController>();

// Build version info (set during deployment)
const BUILD_VERSION = env.buildVersion;
const BUILD_TIMESTAMP_MS = env.buildTimestampMs;

export interface UpdateHandlersDeps {
  // No dependencies needed for basic version checking
}

export function createUpdateHandlers(_deps: UpdateHandlersDeps) {
  return {
    /**
     * GET /api/v1/updates/version
     * Returns current build version information
     */
    async getVersion(_ctx: HttpContext): Promise<Response> {
      return jsonResponse(200, {
        buildId: BUILD_VERSION,
        timestamp: BUILD_TIMESTAMP_MS,
        date: new Date(BUILD_TIMESTAMP_MS).toISOString(),
      });
    },

    /**
     * GET /api/v1/updates/stream
     * Server-Sent Events endpoint for real-time update notifications
     */
    async streamUpdates(ctx: HttpContext): Promise<Response> {
      const stream = new ReadableStream({
        start(controller) {
          // Add client to set
          sseClients.add(controller);

          logger.info("sse.client.connected", {
            clientCount: sseClients.size,
            userAgent: ctx.request.headers.get("user-agent"),
          });

          // Send initial connection message
          const initialMessage = `data: ${JSON.stringify({
            type: "connected",
            buildId: BUILD_VERSION,
            timestamp: BUILD_TIMESTAMP_MS,
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(initialMessage));

          // Keep-alive ping every 30 seconds
          const keepAliveInterval = setInterval(() => {
            try {
              controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
            } catch {
              clearInterval(keepAliveInterval);
              sseClients.delete(controller);
            }
          }, 30000);

          // Cleanup on close
          ctx.request.signal?.addEventListener("abort", () => {
            clearInterval(keepAliveInterval);
            sseClients.delete(controller);
            logger.info("sse.client.disconnected", {
              clientCount: sseClients.size,
            });
          });
        },
        cancel(controller) {
          sseClients.delete(controller);
          logger.info("sse.client.cancelled", {
            clientCount: sseClients.size,
          });
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no", // Disable nginx buffering
        },
      });
    },

    /**
     * POST /api/v1/updates/notify
     * Triggers notification to all connected SSE clients about new version
     * This would typically be called by a deployment script/webhook
     */
    async notifyUpdate(ctx: HttpContext): Promise<Response> {
      const body = (await ctx.request.json()) as {
        buildId?: string;
        timestamp?: number;
      };
      const { buildId, timestamp } = body;

      if (!buildId) {
        return errorResponse(400, "request.validation_failed");
      }

      const message = `event: version-update\ndata: ${JSON.stringify({
        buildId,
        timestamp: timestamp || Date.now(),
      })}\n\n`;

      const encoder = new TextEncoder();
      const encodedMessage = encoder.encode(message);

      let notifiedCount = 0;
      for (const client of sseClients) {
        try {
          client.enqueue(encodedMessage);
          notifiedCount++;
        } catch {
          // Client disconnected, remove from set
          sseClients.delete(client);
        }
      }

      logger.info("sse.update.broadcast", {
        buildId,
        notifiedClients: notifiedCount,
        totalClients: sseClients.size,
      });

      return jsonResponse(200, {
        notified: notifiedCount,
        buildId,
      });
    },
  };
}

/**
 * Helper function to broadcast update to all connected clients
 * Can be called from deployment scripts
 */
export function broadcastUpdate(buildId: string, timestamp?: number): void {
  const message = `event: version-update\ndata: ${JSON.stringify({
    buildId,
    timestamp: timestamp || Date.now(),
  })}\n\n`;

  const encoder = new TextEncoder();
  const encodedMessage = encoder.encode(message);

  for (const client of sseClients) {
    try {
      client.enqueue(encodedMessage);
    } catch {
      sseClients.delete(client);
    }
  }
}
