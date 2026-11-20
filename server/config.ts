import type { ServiceName } from "../src/contracts.ts";
import { isIP } from "node:net";

export interface ServiceConfig {
  databaseUrl: string;
  host: string;
  port: number;
  publicUrl: string;
  corsOrigins: readonly string[];
  logLevel: string;
  service: ServiceName;
  trustedProxy?: readonly string[];
}
export const requiredConfig = (env: NodeJS.ProcessEnv, key: string) => {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing configuration: ${key}`);
  return value;
};
export const configInteger = (
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number
) => {
  const text = env[key] ?? String(fallback);
  if (!/^\d+$/.test(text)) throw new Error(`Invalid configuration: ${key}`);
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`Invalid configuration: ${key}`);
  return value;
};
export const configUrl = (value: string, key: string, protocols = ["http:", "https:"]) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid configuration: ${key}`);
  }
  if (!protocols.includes(url.protocol) || url.username || url.password || url.hash)
    throw new Error(`Invalid configuration: ${key}`);
  return url.href.replace(/\/$/, "");
};
export const readServiceConfig = (
  service: ServiceName,
  env: NodeJS.ProcessEnv = process.env
): ServiceConfig => {
  const url = requiredConfig(env, "DATABASE_URL");
  try {
    if (!["postgres:", "postgresql:"].includes(new URL(url).protocol)) throw new Error();
  } catch {
    throw new Error("Invalid configuration: DATABASE_URL");
  }
  const logLevel = env.LOG_LEVEL ?? "info";
  if (!["fatal", "error", "warn", "info", "debug", "trace", "silent"].includes(logLevel))
    throw new Error("Invalid configuration: LOG_LEVEL");
  const trustedProxy = (env.TRUSTED_PROXY_CIDRS ?? "")
    .split(",")
    .filter(Boolean)
    .map((value) => {
      const entry = value.trim(),
        [address, bits] = entry.split("/");
      const version = isIP(address ?? "");
      if (
        !version ||
        entry.split("/").length > 2 ||
        (bits !== undefined &&
          (!/^\d+$/.test(bits) ||
            Number(bits) < (version === 4 ? 8 : 32) ||
            Number(bits) > (version === 4 ? 32 : 128)))
      )
        throw new Error("Invalid configuration: TRUSTED_PROXY_CIDRS");
      return entry;
    });
  return {
    databaseUrl: url,
    host: env.HOST ?? "127.0.0.1",
    port: configInteger(env, "PORT", { identity: 3001, api: 3002, chat: 3003 }[service], 1, 65535),
    publicUrl: configUrl(requiredConfig(env, "PUBLIC_URL"), "PUBLIC_URL"),
    corsOrigins: (env.CORS_ORIGINS ?? "")
      .split(",")
      .filter(Boolean)
      .map((origin) => {
        const url = configUrl(origin.trim(), "CORS_ORIGINS");
        if (new URL(url).pathname !== "/") throw new Error("Invalid configuration: CORS_ORIGINS");
        return url;
      }),
    logLevel,
    service,
    trustedProxy
  };
};
