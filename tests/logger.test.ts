import { expect, test } from "bun:test";

const { getLogger, serializeError } =
  await import("../src/shared/utils/logger");
const { summarizeBodyForLog } = await import("../src/shared/http/log-summary");

function captureConsole() {
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  const logs: { level: "log" | "warn" | "error"; message: string }[] = [];
  console.log = (message?: unknown) =>
    logs.push({ level: "log", message: String(message ?? "") });
  console.warn = (message?: unknown) =>
    logs.push({ level: "warn", message: String(message ?? "") });
  console.error = (message?: unknown) =>
    logs.push({ level: "error", message: String(message ?? "") });

  return {
    logs,
    restore: () => {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    },
  };
}

test("logger filters by LOG_LEVEL", () => {
  process.env.LOG_LEVEL = "info";
  process.env.LOG_FORMAT = "text";

  const { logs, restore } = captureConsole();
  const logger = getLogger({
    requestId: "req-1",
    userId: "user-1",
    clientIp: "127.0.0.1",
  });
  logger.debug("debug message");
  logger.info("info message");
  restore();

  expect(logs.length).toBe(1);
  expect(logs[0].message).toContain("INFO");
});

test("logger formats text with required fields and redacts", () => {
  process.env.LOG_LEVEL = "debug";
  process.env.LOG_FORMAT = "text";
  process.env.APP_ENV = "production";

  const { logs, restore } = captureConsole();
  const logger = getLogger({
    requestId: "req-2",
    userId: "user-2",
    clientIp: "10.0.0.1",
  });
  logger.info("login.attempt", {
    email: "user@example.com",
    password: "secret",
    token: "abc",
  });
  restore();

  const output = logs[0].message;
  expect(output).toContain("request_id=req-2");
  expect(output).toContain("user_id=user-2");
  expect(output).toContain("client_ip=10.0.0.1");
  expect(output).toContain("service=backend");
  expect(output).toContain("env=production");
  expect(output).toContain('"password":"***"');
  expect(output).toContain('"token":"***"');
});

test("logger formats json with required fields", () => {
  process.env.LOG_LEVEL = "debug";
  process.env.LOG_FORMAT = "json";
  process.env.APP_ENV = "production";

  const { logs, restore } = captureConsole();
  const logger = getLogger({
    requestId: "req-3",
    userId: "user-3",
    clientIp: "192.168.1.10",
  });
  logger.warn("auth.failed", { authorization: "Bearer abc" });
  restore();

  const parsed = JSON.parse(logs[0].message);
  expect(parsed.level).toBe("warn");
  expect(parsed.event).toBe("auth.failed");
  expect(parsed.service).toBe("backend");
  expect(parsed.environment).toBe("production");
  expect(parsed.request_id).toBe("req-3");
  expect(parsed.user_id).toBe("user-3");
  expect(parsed.client_ip).toBe("192.168.1.10");
  expect(parsed.meta.authorization).toBe("***");
});

test("logger masks payment and binary payload fields", () => {
  process.env.LOG_LEVEL = "debug";
  process.env.LOG_FORMAT = "json";
  process.env.APP_ENV = "test";

  const { logs, restore } = captureConsole();
  const logger = getLogger({ requestId: "req-4" });
  logger.info("payment.payload", {
    card_number: "4111111111111111",
    cvv: "123",
    file_base64: "ZmFrZQ==",
    nested: {
      cardholder_name: "User Test",
    },
  });
  restore();

  const parsed = JSON.parse(logs[0].message);
  expect(parsed.meta.card_number).toBe("***");
  expect(parsed.meta.cvv).toBe("***");
  expect(parsed.meta.file_base64).toBe("***");
  expect(parsed.meta.nested.cardholder_name).toBe("***");
});

test("serializeError keeps structured error metadata", () => {
  const error = Object.assign(new Error("boom"), {
    code: "ERR_TEST",
    detail: "details",
    constraint: "constraint_name",
  });

  const serialized = serializeError(error);

  expect(serialized.name).toBe("Error");
  expect(serialized.message).toBe("boom");
  expect(serialized.code).toBe("ERR_TEST");
  expect(serialized.detail).toBe("details");
  expect(serialized.constraint).toBe("constraint_name");
  expect(serialized.stack).toBeDefined();
});

test("summarizeBodyForLog reduces nested payloads to debug-friendly summaries", () => {
  const summary = summarizeBodyForLog({
    id: "comp-1",
    status: "pending",
    items: [{ id: "a" }, { id: "b" }],
    data: {
      total_count: 2,
      records: [{ id: "a" }, { id: "b" }],
    },
  }) as Record<string, unknown>;

  expect(summary.type).toBe("object");
  expect(summary.identifiers).toEqual({ id: "comp-1" });
  expect(summary.fields).toEqual({ status: "pending" });
  expect(summary.array_lengths).toEqual({ items: 2 });
  expect(summary.data).toBeDefined();
});
