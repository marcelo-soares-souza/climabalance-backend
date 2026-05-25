import { expect, test } from "bun:test";

const { requireEmail, requireString, optionalString } =
  await import("../src/shared/validation/validators");

test("requireEmail validates email", () => {
  expect(requireEmail("user@example.com")).toBe("user@example.com");
  const invalid = requireEmail("bad", "email");
  expect(typeof invalid).toBe("object");
});

test("requireString validates required string", () => {
  expect(requireString("abc", "field")).toBe("abc");
  const invalid = requireString("", "field");
  expect(typeof invalid).toBe("object");
});

test("optionalString returns undefined for empty values", () => {
  expect(optionalString("", "field")).toBeUndefined();
  expect(optionalString(null, "field")).toBeUndefined();
});
