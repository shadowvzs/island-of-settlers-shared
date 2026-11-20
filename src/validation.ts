import type { AccountAvatarGender, AccountNation } from "./contracts.ts";
import { isNation } from "./nations.ts";

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const isAccountNation = (value: unknown): value is AccountNation => isNation(value);
export const isAccountAvatarGender = (value: unknown): value is AccountAvatarGender =>
  value === "female" || value === "male";
export const isDisplayName = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9]{3,32}$/.test(value);
export const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};
/** Only account-owned revisions may be sent back; zero is the initial revision. */
export const parseRevision = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,9})$/.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision <= 2147483647 ? revision : null;
};

/** The validation kit's record guard under its established API/account name. */
export { isPlainObject as isObject } from "./validation/guards.ts";
