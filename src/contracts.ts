import type { Nation } from "./nations.ts";

export const API_VERSION = "1";
export const ERROR_CODES = [
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_REQUIRED",
  "AUTH_FORBIDDEN",
  "AUTH_SESSION_REVOKED",
  "ACCOUNT_ALREADY_EXISTS",
  "ACCOUNT_DELETION_PENDING",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
  "NOT_FOUND",
  "SAVE_CONFLICT",
  "SESSION_LEASE_HELD",
  "SESSION_LEASE_LOST",
  "SAVE_REJECTED",
  "SERVER_FULL",
  "CLIENT_OUTDATED",
  "SERVICE_NOT_READY",
  "CATCH_UP_UNAVAILABLE",
  "CHAIN_TOKEN_REQUIRED",
  "CHAIN_TOKEN_INVALID",
  "CHAIN_BASE_MISMATCH",
  "CAMPAIGN_VICTORY_PENDING",
  "FEATURE_DISABLED",
  "REWARDS_OFF",
  "SAVE_SLOT_HOLDS_HOME",
  "INTERNAL_ERROR"
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export type ServiceName = "identity" | "api" | "chat";
export type AccountRole = "player" | "moderator" | "admin";
/** An account's chosen nation: the shared nation list (nations.ts). */
export type AccountNation = Nation;
/** Optional avatar face gender; absent keeps each nation's historical canonical portrait. */
export type AccountAvatarGender = "female" | "male";
export interface ErrorResponse {
  code: ErrorCode;
  message: string;
  requestId: string;
}
export interface HealthResponse {
  service: ServiceName;
  status: "ok";
  apiVersion: string;
}
export interface PublicAccount {
  /** Omitted when the account has never chosen (old accounts keep their canonical portrait). */
  avatarGender?: AccountAvatarGender;
  id: string;
  displayName: string;
  role: AccountRole;
  nation: AccountNation;
}
export interface RuntimeConfig {
  apiVersion: string;
  identityUrl: string;
  chatUrl: string;
  minClientVersion: string;
  maintenance: boolean;
  features: {
    accounts: boolean;
    cloudSaves: boolean;
    shop: boolean;
    chat: boolean;
    friends: boolean;
    trades: boolean;
    guilds: boolean;
  };
}
/** Shared across identity/API/chat; never contains an email, password or refresh token. */
export interface AccessClaims extends Omit<PublicAccount, "id"> {
  sub: string;
  sid: string;
  iss: string;
  aud: string[];
  iat: number;
  nbf: number;
  exp: number;
}
