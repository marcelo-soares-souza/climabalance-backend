import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

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

function extractDocumentedRouteSignatures(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("| "))
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((parts) => parts.length >= 5)
    .filter((parts) => /^[A-Z]+$/.test(parts[1] ?? ""))
    .map((parts) => `${parts[1]} ${parts[2]}`);
}

describe("Route access matrix", () => {
  test("documents every runtime route", () => {
    const routesSource = readFileSync(
      new URL("../src/infrastructure/http/routes.ts", import.meta.url),
      "utf-8",
    );
    const matrixSource = readFileSync(
      new URL("../docs/ROUTE_ACCESS_MATRIX.md", import.meta.url),
      "utf-8",
    );

    const runtimeRoutes = extractRuntimeRouteSignatures(routesSource).sort();
    const documentedRoutes =
      extractDocumentedRouteSignatures(matrixSource).sort();

    expect(documentedRoutes).toEqual(runtimeRoutes);
  });
});
