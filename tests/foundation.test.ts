import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import test from "node:test";

import { signAccessToken, verifyAccessToken } from "../server/access-tokens.ts";
import { readServiceConfig } from "../server/config.ts";
import { createBackendService } from "../server/service.ts";
import { API_VERSION, type AccessClaims } from "../src/contracts.ts";
import { isDisplayName, normalizeEmail, parseRevision } from "../src/validation.ts";

const config = readServiceConfig("identity", {
  DATABASE_URL: "postgresql://user:password@localhost/test",
  PUBLIC_URL: "http://localhost:3001",
  CORS_ORIGINS: "http://localhost:5173"
});
test("validates public identity fields and optimistic revisions without normalizing away invalid data", () => {
  assert.equal(normalizeEmail(" User@example.COM "), "user@example.com");
  assert.equal(normalizeEmail("user@example"), null);
  assert(isDisplayName("Explorer12"));
  assert(!isDisplayName("Explorer_12"));
  assert.equal(parseRevision("2147483647"), 2147483647);
  for (const input of ["01", "-1", "0.5", "2147483648", undefined])
    assert.equal(parseRevision(input), null);
});
test("rejects malformed configuration without including credentials in errors", () => {
  assert.throws(
    () => readServiceConfig("api", { DATABASE_URL: "postgres://secret@bad", PORT: "NaN" }),
    /Missing|Invalid/
  );
  assert.throws(
    () =>
      readServiceConfig("api", {
        DATABASE_URL: "not-a-url-secret",
        PUBLIC_URL: "http://localhost"
      }),
    (error) => error instanceof Error && !error.message.includes("secret")
  );
});
test("health/readiness, request IDs, errors and CORS use the shared contracts", async () => {
  let ready = false;
  const app = createBackendService({ config, readiness: async () => ready, logging: false });
  try {
    const health = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "review_123" }
    });
    assert.deepEqual(health.json(), { service: "identity", status: "ok", apiVersion: API_VERSION });
    assert.equal(health.headers["x-request-id"], "review_123");
    const unavailable = await app.inject({ method: "GET", url: "/ready" });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.json().code, "SERVICE_NOT_READY");
    ready = true;
    assert.equal((await app.inject({ method: "GET", url: "/ready" })).statusCode, 200);
    const forbidden = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://other.test" }
    });
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.json().code, "AUTH_FORBIDDEN");
    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/v1/auth/login",
      headers: { origin: "http://localhost:5173" }
    });
    assert.equal(allowed.statusCode, 204);
    assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:5173");
    const missing = await app.inject({ method: "GET", url: "/does-not-exist" });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().code, "NOT_FOUND");
  } finally {
    await app.close();
  }
});
test("forwarded client IP is trusted only from configured proxy peers", async () => {
  for (const input of ["true", "0.0.0.0/0", "::/0", "not-an-ip", "127.0.0.1/33"])
    assert.throws(
      () =>
        readServiceConfig("api", {
          DATABASE_URL: "postgres://localhost/test",
          PUBLIC_URL: "http://localhost",
          TRUSTED_PROXY_CIDRS: input
        }),
      /TRUSTED_PROXY_CIDRS/
    );
  for (const trusted of [false, true]) {
    const app = createBackendService({
      config: { ...config, trustedProxy: trusted ? ["127.0.0.1"] : [] },
      readiness: async () => true,
      logging: false
    });
    app.get("/client-ip", async (request) => ({ ip: request.ip }));
    try {
      const viaLocal = await app.inject({
        method: "GET",
        url: "/client-ip",
        remoteAddress: "127.0.0.1",
        headers: { "x-forwarded-for": "198.51.100.9" }
      });
      assert.equal(viaLocal.json().ip, trusted ? "198.51.100.9" : "127.0.0.1");
      const untrusted = await app.inject({
        method: "GET",
        url: "/client-ip",
        remoteAddress: "192.0.2.5",
        headers: { "x-forwarded-for": "198.51.100.9" }
      });
      assert.equal(untrusted.json().ip, "192.0.2.5");
    } finally {
      await app.close();
    }
  }
});
test("Ed25519 JWT verifies every authority/time boundary and rejects header/signature confusion", () => {
  const keys = generateKeyPairSync("ed25519"),
    other = generateKeyPairSync("ed25519");
  const claims: AccessClaims = {
    sub: randomUUID(),
    sid: randomUUID(),
    displayName: "Settler123",
    role: "player",
    nation: "roman",
    iss: "http://identity.test",
    aud: ["settlers-api"],
    iat: 100,
    nbf: 100,
    exp: 1000
  };
  const options = {
    issuer: claims.iss,
    audience: "settlers-api",
    nowSeconds: 200,
    keyId: "test-key",
    clockSkewSeconds: 0
  };
  const token = signAccessToken(claims, keys.privateKey, "test-key");
  assert.deepEqual(verifyAccessToken(token, keys.publicKey, options), claims);
  assert.throws(() => verifyAccessToken(token, other.publicKey, options), /Invalid access token/);
  for (const changed of [
    { iss: "other" },
    { aud: ["settlers-chat"] },
    { exp: 199 },
    { nbf: 250 },
    { iat: 250 },
    { role: "owner" },
    { sid: "invalid" },
    { displayName: "invalid_name" }
  ])
    assert.throws(
      () =>
        verifyAccessToken(
          signAccessToken({ ...claims, ...changed } as AccessClaims, keys.privateKey, "test-key"),
          keys.publicKey,
          options
        ),
      /Invalid access token/
    );
  const parts = token.split(".");
  parts[0] = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT", kid: "test-key" })).toString(
    "base64url"
  );
  assert.throws(
    () => verifyAccessToken(parts.join("."), keys.publicKey, options),
    /Invalid access token/
  );
  assert.throws(
    () => verifyAccessToken(token.slice(0, -1), keys.publicKey, options),
    /Invalid access token/
  );
});
