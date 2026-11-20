import { sign, verify, type KeyObject } from "node:crypto";

import type { AccessClaims } from "../src/contracts.ts";
import { isAccountNation, isDisplayName, isObject, isUuid } from "../src/validation.ts";

export interface TokenVerification {
  issuer: string;
  audience: string;
  keyId?: string;
  nowSeconds?: number;
  clockSkewSeconds?: number;
}
export class TokenError extends Error {
  constructor() {
    super("Invalid access token");
  }
}

export const signAccessToken = (claims: AccessClaims, key: KeyObject, keyId: string) => {
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519")
    throw new Error("Ed25519 private key required");
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: keyId })).toString(
    "base64url"
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${sign(null, Buffer.from(input), key).toString("base64url")}`;
};

const parsePart = (part: string): Record<string, unknown> => {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new TokenError();
  const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  if (!isObject(value)) throw new TokenError();
  return value;
};

/** Signature/claim validation only; callers also check identity's live session for immediate revocation. */
export const verifyAccessToken = (
  token: string,
  key: KeyObject,
  options: TokenVerification
): AccessClaims => {
  try {
    if (token.length > 8192 || key.type !== "public" || key.asymmetricKeyType !== "ed25519")
      throw new TokenError();
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => !part)) throw new TokenError();
    const [headerText, payloadText, signatureText] = parts as [string, string, string];
    const header = parsePart(headerText);
    if (
      header.alg !== "EdDSA" ||
      header.typ !== "JWT" ||
      typeof header.kid !== "string" ||
      header.kid.length > 64 ||
      (options.keyId !== undefined && header.kid !== options.keyId) ||
      header.jku !== undefined ||
      header.x5u !== undefined
    )
      throw new TokenError();
    if (!/^[A-Za-z0-9_-]+$/.test(signatureText)) throw new TokenError();
    const signature = Buffer.from(signatureText, "base64url");
    if (
      signature.length !== 64 ||
      !verify(null, Buffer.from(`${headerText}.${payloadText}`), key, signature)
    )
      throw new TokenError();
    const claims = parsePart(payloadText);
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000),
      skew = options.clockSkewSeconds ?? 5;
    if (
      !isUuid(claims.sub) ||
      !isUuid(claims.sid) ||
      !isDisplayName(claims.displayName) ||
      !isAccountNation(claims.nation) ||
      !["player", "moderator", "admin"].includes(claims.role as string) ||
      claims.iss !== options.issuer ||
      !Array.isArray(claims.aud) ||
      !claims.aud.includes(options.audience) ||
      claims.aud.length > 8 ||
      !claims.aud.every((value) => typeof value === "string" && value.length <= 64) ||
      ![claims.iat, claims.nbf, claims.exp].every(Number.isSafeInteger)
    )
      throw new TokenError();
    const { exp, iat, nbf } = claims as unknown as AccessClaims;
    if (exp <= now - skew || nbf > now + skew || iat > now + skew || exp <= iat || exp - iat > 3600)
      throw new TokenError();
    return claims as unknown as AccessClaims;
  } catch {
    throw new TokenError();
  }
};
