import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import pg from "pg";

import { API_VERSION, type ErrorCode, type RuntimeConfig } from "../src/contracts.ts";
import type { ServiceConfig } from "./config.ts";

export class ServiceError extends Error {
  code: ErrorCode;
  status: number;
  constructor(code: ErrorCode, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface BackendServiceOptions {
  config: ServiceConfig;
  readiness?: () => Promise<boolean>;
  /** A fixed document, or a reader for a service whose public configuration follows stored settings. */
  runtimeConfig?: RuntimeConfig | (() => Promise<RuntimeConfig>);
  logging?: boolean;
}

/** Server-only export. Browser imports of shared/src/index.ts never pull Fastify/PostgreSQL. */
export const createBackendService = ({
  config,
  readiness,
  runtimeConfig,
  logging = true
}: BackendServiceOptions) => {
  const app = Fastify({
    bodyLimit: 65536,
    requestTimeout: 15000,
    connectionTimeout: 10000,
    trustProxy: config.trustedProxy?.length ? [...config.trustedProxy] : false,
    requestIdHeader: false,
    genReqId: (request) => {
      const id = request.headers["x-request-id"];
      return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : randomUUID();
    },
    logger: logging
      ? {
          level: config.logLevel,
          redact: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.body.password",
            "req.body.refreshToken"
          ]
        }
      : false
  });
  const pool = readiness
    ? undefined
    : new pg.Pool({
        connectionString: config.databaseUrl,
        max: 4,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 10000,
        query_timeout: 3000
      });
  pool?.on("error", () => app.log.warn("Database pool connection interrupted"));
  const check =
    readiness ??
    (async () => {
      const table = {
        identity: "identity.accounts",
        api: "game.save_slots",
        chat: "chat.messages"
      }[config.service];
      const result = await pool!.query<{ present: boolean }>(
        "SELECT to_regclass($1) IS NOT NULL AS present",
        [table]
      );
      return Boolean(result.rows[0]?.present);
    });
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("X-Request-Id", request.id)
      .header("X-Server-Time", new Date().toISOString())
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer");
    const origin = request.headers.origin;
    if (!origin) return;
    if (!config.corsOrigins.includes(origin))
      throw new ServiceError("AUTH_FORBIDDEN", 403, "Origin is not allowed");
    reply
      .header("Access-Control-Allow-Origin", origin)
      .header("Access-Control-Allow-Credentials", "true")
      .header("Vary", "Origin")
      .header("Access-Control-Expose-Headers", "X-Request-Id,X-Server-Time,ETag");
  });
  app.options("/*", async (_request, reply) =>
    reply
      .header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
      .header(
        "Access-Control-Allow-Headers",
        "Content-Type,Content-Encoding,Authorization,If-Match,X-Client-Version,X-Request-Id,X-Session-Lease,X-Interval-Token"
      )
      .code(204)
      .send()
  );
  app.get("/health", async () => ({
    service: config.service,
    status: "ok",
    apiVersion: API_VERSION
  }));
  app.get("/ready", async () => {
    try {
      if (await check()) return { service: config.service, status: "ok", apiVersion: API_VERSION };
    } catch {
      /* Liveness stays independent of PostgreSQL outages. */
    }
    throw new ServiceError(
      "SERVICE_NOT_READY",
      503,
      "Database is unavailable or migrations are missing"
    );
  });
  if (typeof runtimeConfig === "function")
    app.get("/config", async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return runtimeConfig();
    });
  else if (runtimeConfig) app.get("/config", async () => runtimeConfig);
  app.setNotFoundHandler(async (request, reply) =>
    reply.code(404).send({
      code: "NOT_FOUND",
      message: "Endpoint not found",
      requestId: request.id
    })
  );
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ServiceError)
      return reply
        .code(error.status)
        .send({ code: error.code, message: error.message, requestId: request.id });
    const errorStatus =
      typeof error === "object" && error !== null && "statusCode" in error ? error.statusCode : 500;
    const status =
      typeof errorStatus === "number" && errorStatus >= 400 && errorStatus <= 499
        ? errorStatus
        : 500;
    if (status === 500) request.log.error("Request failed");
    return reply
      .code(status)
      .send({
        code: status === 500 ? "INTERNAL_ERROR" : "VALIDATION_FAILED",
        message: status === 500 ? "Request failed" : "Invalid request",
        requestId: request.id
      });
  });
  app.addHook("onClose", async () => {
    await pool?.end();
  });
  return app;
};
