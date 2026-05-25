import { expect, test } from "bun:test";

const { uuidv7 } = await import("../src/shared/utils/id");

test("uuidv7 format", () => {
  const id = uuidv7();
  expect(id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test("uuidv7 uniqueness", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 100; i += 1) {
    ids.add(uuidv7());
  }
  expect(ids.size).toBe(100);
});
