import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { OPENAPI_ROUTE_SIGNATURES } from "../src/infrastructure/http/openapi";

function extractRuntimeRouteSignatures(source: string): string[] {
  const signatures: string[] = [];
  const regex = /addRoute\(\s*["']([A-Z]+)["']\s*,\s*["']([^"']+)["']/g;

  for (const match of source.matchAll(regex)) {
    const method = match[1];
    const path = match[2];
    if (method && path) {
      signatures.push(`${method} ${path}`);
    }
  }

  return signatures;
}

describe("OpenAPI route catalog", () => {
  test("covers all runtime routes registered in buildRouter", () => {
    const routesSource = readFileSync(
      new URL("../src/infrastructure/http/routes.ts", import.meta.url),
      "utf-8",
    );

    const runtimeRoutes = extractRuntimeRouteSignatures(routesSource).sort();
    const documentedRoutes = [...OPENAPI_ROUTE_SIGNATURES].sort();

    expect(documentedRoutes).toEqual(runtimeRoutes);
  });
});
