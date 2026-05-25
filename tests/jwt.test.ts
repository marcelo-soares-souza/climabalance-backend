import { expect, test } from "bun:test";

const { signJwt, verifyJwt } = await import("../src/infrastructure/crypto/jwt");

test("sign and verify jwt", async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "user-1",
    roles: ["individual"],
    iss: "issuer",
    aud: "aud",
    iat: now,
    exp: now + 60,
  };

  const token = await signJwt(payload, "secret");
  const verified = await verifyJwt(token, "secret");
  expect(verified?.sub).toBe("user-1");
});

test("reject expired jwt", async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "user-1",
    roles: ["individual"],
    iss: "issuer",
    aud: "aud",
    iat: now - 120,
    exp: now - 60,
  };

  const token = await signJwt(payload, "secret");
  const verified = await verifyJwt(token, "secret");
  expect(verified).toBeNull();
});
