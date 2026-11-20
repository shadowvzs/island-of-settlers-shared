import type { FastifyInstance } from "fastify";

import type { ServiceConfig } from "./config.ts";

/** A process owns its shutdown hooks; test-created service instances never install global handlers. */
export const startBackendService = async (app: FastifyInstance, config: ServiceConfig) => {
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    try {
      await app.close();
    } catch {
      process.exitCode = 1;
    }
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  await app.listen({ host: config.host, port: config.port });
};
