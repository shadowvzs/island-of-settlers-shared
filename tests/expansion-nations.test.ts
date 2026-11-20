import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import test from "node:test";

import { signAccessToken, verifyAccessToken } from "../server/access-tokens.ts";
import type { AccessClaims, AccountNation } from "../src/contracts.ts";
import { isAccountNation } from "../src/validation.ts";

const nations: readonly AccountNation[] = [
  "roman", "viking", "japanese", "nubian", "indigenous", "chinese", "persian", "maya"
];

test("all eight nation identities survive signed account tokens without accepting candidate names", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const base: Omit<AccessClaims, "nation"> = {
    aud: ["settlers-api", "settlers-chat"], displayName: "Explorer123", exp: 1000,
    iat: 100, iss: "http://identity.test", nbf: 100, role: "player", sid: randomUUID(), sub: randomUUID()
  };
  const options = { audience: "settlers-api", issuer: base.iss, keyId: "test-key", nowSeconds: 200 };
  for (const nation of nations) {
    assert(isAccountNation(nation));
    const claims = { ...base, nation };
    const token = signAccessToken(claims, privateKey, "test-key");
    assert.equal(verifyAccessToken(token, publicKey, options).nation, nation);
    assert.equal(verifyAccessToken(token, publicKey, { ...options, audience: "settlers-chat" }).nation, nation);
  }
  for (const nation of ["moche", "khmer", "aksumite", "tang", "Roman", "", null, {}]) {
    assert(!isAccountNation(nation));
    const invalid = { ...base, nation } as AccessClaims;
    assert.throws(() => verifyAccessToken(signAccessToken(invalid, privateKey, "test-key"), publicKey, options),
      /Invalid access token/);
  }
});
