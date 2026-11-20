import { isIP } from "node:net";

import type { ServiceConfig } from "./config.ts";

const isLoopback = (host: string) => {
  const address = host.toLowerCase().replace(/^\[|\]$/g, "");
  return address === "localhost" || address === "::1" ||
    (isIP(address) === 4 && address.startsWith("127."));
};

/** Explicit local recovery mode; never changes the default production maintenance policy. */
export const preserveLocalData = (
  config: Pick<ServiceConfig, "databaseUrl" | "host" | "publicUrl">,
  env: NodeJS.ProcessEnv = process.env
) => {
  const value = env.DEV_PRESERVE_DATA ?? "0";
  if (value === "0") return false;
  if (value !== "1") throw new Error("DEV_PRESERVE_DATA must be 0 or 1");
  if (![config.host, new URL(config.publicUrl).hostname, new URL(config.databaseUrl).hostname]
    .every(isLoopback)) throw new Error("DEV_PRESERVE_DATA requires loopback service and database hosts");
  return true;
};
