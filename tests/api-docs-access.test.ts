import { describe, expect, test } from "bun:test";
import { signJwt } from "../src/infrastructure/crypto/jwt";
import { withApiDocsAccess } from "../src/infrastructure/http/auth";

process.env.APP_ENV = "test";
process.env.APP_PORT = "3000";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/test";
process.env.JWT_SECRET = "test-secret";
process.env.CSRF_SECRET = "test-csrf-secret";
process.env.JWT_ISSUER = "test-issuer";
process.env.JWT_AUDIENCE = "test-audience";
process.env.JWT_TTL_SECONDS = "900";
process.env.PASSWORD_PEPPER = "test-pepper";
process.env.EMAIL_FROM = "no-reply@example.com";

async function makeAdminToken() {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      sub: "admin-user",
      roles: ["administrator"],
      iss: process.env.JWT_ISSUER!,
      aud: process.env.JWT_AUDIENCE!,
      iat: now,
      exp: now + 300,
    },
    process.env.JWT_SECRET!,
  );
}

function makeContext(headers?: Record<string, string>) {
  return {
    request: new Request("http://localhost/api/v1/docs", { headers }),
    params: {},
    auth: undefined,
  };
}

describe("withApiDocsAccess", () => {
  test("allows docs without extra auth in none mode", async () => {
    process.env.ENABLE_API_DOCS = "true";
    process.env.API_DOCS_AUTH_MODE = "none";

    const handler = withApiDocsAccess(async () => new Response("ok"));
    const response = await handler(makeContext());

    expect(response.status).toBe(200);
  });

  test("requires basic auth when configured", async () => {
    process.env.ENABLE_API_DOCS = "true";
    process.env.API_DOCS_AUTH_MODE = "basic";
    process.env.API_DOCS_BASIC_USERNAME = "docs";
    process.env.API_DOCS_BASIC_PASSWORD = "secret";

    const handler = withApiDocsAccess(async () => new Response("ok"));
    const unauthorized = await handler(makeContext());

    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("Basic");

    const authorization = `Basic ${Buffer.from("docs:secret").toString("base64")}`;
    const authorized = await handler(makeContext({ authorization }));

    expect(authorized.status).toBe(200);
  });

  test("requires administrator bearer token in admin mode", async () => {
    process.env.ENABLE_API_DOCS = "true";
    process.env.API_DOCS_AUTH_MODE = "admin";

    const handler = withApiDocsAccess(async () => new Response("ok"));
    const unauthorized = await handler(makeContext());
    expect(unauthorized.status).toBe(401);

    const token = await makeAdminToken();
    const authorized = await handler(
      makeContext({ authorization: `Bearer ${token}` }),
    );

    expect(authorized.status).toBe(200);
  });
});
