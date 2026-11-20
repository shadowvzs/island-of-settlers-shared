import { strict as assert } from "node:assert";
import { test } from "node:test";

import { preserveLocalData } from "../server/local-data-preservation.ts";

const local = { databaseUrl: "postgres://user:password@127.0.0.1:54329/settlers",
  host: "127.0.0.1", publicUrl: "http://localhost:3001" };

test("normal services retain deletion maintenance unless local preservation is explicitly requested", () => {
  assert.equal(preserveLocalData(local, {}), false);
  assert.equal(preserveLocalData(local, { DEV_PRESERVE_DATA: "0" }), false);
  assert.equal(preserveLocalData({ ...local, host: "0.0.0.0" }, {}), false);
  assert.equal(preserveLocalData(local, { DEV_PRESERVE_DATA: "1" }), true);
  assert.equal(preserveLocalData({ databaseUrl: "postgres://u:p@[::1]/settlers", host: "::1",
    publicUrl: "http://[::1]:3001" }, { DEV_PRESERVE_DATA: "1" }), true);
});

test("preservation rejects non-loopback bindings, advertised services, databases and ambiguous flags", () => {
  const env = { DEV_PRESERVE_DATA: "1" };
  for (const host of ["0.0.0.0", "::", "192.168.1.2", "localhost.example.com"])
    assert.throws(() => preserveLocalData({ ...local, host }, env), /requires loopback/);
  assert.throws(() => preserveLocalData({ ...local, publicUrl: "http://game.example.com" }, env),
    /requires loopback/);
  assert.throws(() => preserveLocalData({ ...local, databaseUrl: "postgres://u:p@database/settlers" }, env),
    /requires loopback/);
  assert.throws(() => preserveLocalData(local, { DEV_PRESERVE_DATA: "true" }), /must be 0 or 1/);
});
