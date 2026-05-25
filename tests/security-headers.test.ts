import { describe, expect, test } from "bun:test";
import { Router } from "../src/shared/http/router";

describe("security headers", () => {
  test("adds baseline hardening headers to HTTP responses", async () => {
    const router = new Router();
    router.add("GET", "/ping", () => new Response("ok"));

    const response = await router.handle(new Request("http://localhost/ping"), {
      clientIp: "127.0.0.1",
    });

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
  });

  test("preserves route-specific content security policy overrides", async () => {
    const router = new Router();
    router.add(
      "GET",
      "/docs",
      () =>
        new Response("ok", {
          headers: {
            "content-security-policy": "default-src 'self'",
          },
        }),
    );

    const response = await router.handle(new Request("http://localhost/docs"), {
      clientIp: "127.0.0.1",
    });

    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'self'",
    );
  });
});
