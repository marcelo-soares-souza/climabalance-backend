import { describe, expect, test, mock } from "bun:test";
import type Stripe from "stripe";
import { createStripeConnectHandlers } from "../src/infrastructure/http/stripe-connect-handlers";
import type { HttpContext } from "../src/shared/http/router";

function createMockStripe(
  overrides: Partial<Record<string, any>> = {},
): Stripe {
  return {
    accounts: {
      createLoginLink: mock().mockResolvedValue({
        url: "https://dashboard.stripe.com/test",
        created: 1710000000,
        object: "login_link",
      }),
      create: mock(),
      retrieve: mock(),
      ...overrides.accounts,
    },
    accountLinks: {
      create: mock(),
      ...overrides.accountLinks,
    },
  } as unknown as Stripe;
}

function createDeps(
  stripe: Stripe,
  overrides: Partial<Record<string, any>> = {},
) {
  const auditLogs: Array<Record<string, unknown>> = [];
  return {
    stripeConnectRepository: {
      findByUserId: mock(async () => null),
      ...overrides.repository,
    },
    users: {
      findById: mock(async (userId: string) => ({
        id: userId,
        email: "producer@example.com",
      })),
      getProfile: mock(async () => ({
        countryCode: "BR",
        addressCountry: null,
      })),
      ...overrides.users,
    },
    idGenerator: { generate: () => "id-1" },
    clock: { now: () => new Date("2026-05-04T12:00:00Z") },
    auditLog: {
      log: mock(async (entry: Record<string, unknown>) => {
        auditLogs.push(entry);
      }),
    },
    _auditLogs: auditLogs as Array<Record<string, unknown>>,
    stripe,
    ...overrides,
  };
}

function createContext(authUserId?: string): HttpContext {
  return {
    request: new Request("http://localhost/api/v1/producers/stripe/dashboard", {
      method: "POST",
    }),
    params: {},
    query: new URLSearchParams(),
    requestId: "test-request-id",
    clientIp: "127.0.0.1",
    body: null,
    auth: authUserId ? { userId: authUserId, roles: ["producer"] } : undefined,
    locale: "pt-BR",
  };
}

describe("StripeConnectHandlers - dashboard", () => {
  test("returns 404 when no stripe account record exists", async () => {
    const stripe = createMockStripe();
    const deps = createDeps(stripe, {
      repository: {
        findByUserId: mock(async () => null),
      },
    });
    const handlers = createStripeConnectHandlers(deps);
    const ctx = createContext("user-1");

    const response = await handlers.dashboard(ctx);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: { message_key: "producer.stripe.not_connected" },
    });
  });

  test("returns 400 when onboarding is incomplete (charges/payouts disabled)", async () => {
    const stripe = createMockStripe();
    const deps = createDeps(stripe, {
      repository: {
        findByUserId: mock(async () => ({
          id: "sca-1",
          userId: "user-1",
          stripeAccountId: "acct_incomplete",
          chargesEnabled: false,
          payoutsEnabled: false,
          country: "BR",
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      },
    });
    const handlers = createStripeConnectHandlers(deps);
    const ctx = createContext("user-1");

    const response = await handlers.dashboard(ctx);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: { message_key: "producer.stripe.onboarding_incomplete" },
    });
  });

  test("returns 400 when charges_enabled is false", async () => {
    const stripe = createMockStripe();
    const deps = createDeps(stripe, {
      repository: {
        findByUserId: mock(async () => ({
          id: "sca-2",
          userId: "user-1",
          stripeAccountId: "acct_no_charges",
          chargesEnabled: false,
          payoutsEnabled: true,
          country: "BR",
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      },
    });
    const handlers = createStripeConnectHandlers(deps);
    const ctx = createContext("user-1");

    const response = await handlers.dashboard(ctx);
    expect(response.status).toBe(400);
  });

  test("returns 400 when payouts_enabled is false", async () => {
    const stripe = createMockStripe();
    const deps = createDeps(stripe, {
      repository: {
        findByUserId: mock(async () => ({
          id: "sca-3",
          userId: "user-1",
          stripeAccountId: "acct_no_payouts",
          chargesEnabled: true,
          payoutsEnabled: false,
          country: "BR",
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      },
    });
    const handlers = createStripeConnectHandlers(deps);
    const ctx = createContext("user-1");

    const response = await handlers.dashboard(ctx);
    expect(response.status).toBe(400);
  });

  test("returns dashboard_url when onboarding is complete", async () => {
    const createLoginLink = mock().mockResolvedValue({
      url: "https://dashboard.stripe.com/dashboard_url",
      created: 1710000000,
      object: "login_link",
    });
    const stripe = createMockStripe({
      accounts: {
        createLoginLink,
        create: mock(),
        retrieve: mock(),
      },
    });
    const deps = createDeps(stripe, {
      repository: {
        findByUserId: mock(async () => ({
          id: "sca-4",
          userId: "user-1",
          stripeAccountId: "acct_complete",
          chargesEnabled: true,
          payoutsEnabled: true,
          country: "BR",
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      },
    });
    const handlers = createStripeConnectHandlers(deps);
    const ctx = createContext("user-1");

    const response = await handlers.dashboard(ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: { dashboard_url: "https://dashboard.stripe.com/dashboard_url" },
    });
    expect(createLoginLink).toHaveBeenCalledWith("acct_complete");
  });

  test("returns 401 when unauthenticated", async () => {
    const stripe = createMockStripe();
    const deps = createDeps(stripe);
    const handlers = createStripeConnectHandlers(deps);
    const ctx = createContext();

    const response = await handlers.dashboard(ctx);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: { message_key: "auth.required" },
    });
  });
});

describe("StripeConnectHandlers - onboard", () => {
  test("creates connect account with stored user email and correct return URLs", async () => {
    const create = mock().mockResolvedValue({
      id: "acct_new_123",
      charges_enabled: false,
      payouts_enabled: false,
    });
    const accountLinkCreate = mock().mockResolvedValue({
      url: "https://connect.stripe.com/onboarding/test",
    });
    const stripe = createMockStripe({
      accounts: {
        create,
        retrieve: mock(),
        createLoginLink: mock(),
      },
      accountLinks: {
        create: accountLinkCreate,
      },
    });
    const repositoryCreate = mock(async () => {});
    const deps = createDeps(stripe, {
      repository: {
        findByUserId: mock(async () => null),
        create: repositoryCreate,
      },
      users: {
        findById: mock(async () => ({
          id: "user-1",
          email: "producer@climabalance.org",
        })),
        getProfile: mock(async () => ({
          countryCode: "BR",
          addressCountry: null,
        })),
      },
    });
    const handlers = createStripeConnectHandlers(deps);
    const ctx = createContext("user-1");

    const response = await handlers.onboard(ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "express",
        country: "BR",
        email: "producer@climabalance.org",
      }),
    );
    expect(accountLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "acct_new_123",
        refresh_url:
          "https://dev.climabalance.org/how-to-use/stripe-setup?refresh=true",
        return_url:
          "https://dev.climabalance.org/how-to-use/stripe-setup?success=true",
        type: "account_onboarding",
      }),
    );
    expect(repositoryCreate).toHaveBeenCalled();
    expect(body.data.onboarding_url).toBe(
      "https://connect.stripe.com/onboarding/test",
    );
  });

  test("returns 404 when authenticated user record no longer exists", async () => {
    const stripe = createMockStripe({
      accounts: {
        create: mock(),
        retrieve: mock(),
        createLoginLink: mock(),
      },
    });
    const deps = createDeps(stripe, {
      users: {
        findById: mock(async () => null),
      },
    });
    const handlers = createStripeConnectHandlers(deps);
    const ctx = createContext("user-1");

    const response = await handlers.onboard(ctx);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: { message_key: "user.not_found" },
    });
  });
});
