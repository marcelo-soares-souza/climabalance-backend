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
process.env.EMAIL_CONFIRM_TTL_MINUTES = "60";

import { beforeEach, describe, expect, test } from "bun:test";
import { validateStripeConfiguration } from "../src/infrastructure/bootstrap/build-app-runtime";

describe("validateStripeConfiguration", () => {
  const originalSecret = process.env.STRIPE_SECRET_KEY;
  const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = originalSecret;
    process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
  });

  test("does nothing when Stripe gateway is disabled", () => {
    process.env.STRIPE_SECRET_KEY = "";
    process.env.STRIPE_WEBHOOK_SECRET = "";

    expect(() => validateStripeConfiguration(false)).not.toThrow();
  });

  test("fails when Stripe gateway is enabled without required envs", () => {
    process.env.STRIPE_SECRET_KEY = "";
    process.env.STRIPE_WEBHOOK_SECRET = "";

    expect(() => validateStripeConfiguration(true)).toThrow(
      "Stripe configuration required when Stripe gateway is enabled: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET",
    );
  });

  test("passes when Stripe gateway is enabled with required envs", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";

    expect(() => validateStripeConfiguration(true)).not.toThrow();
  });
});
