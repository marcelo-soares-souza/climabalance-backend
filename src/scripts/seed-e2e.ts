import { pgPool } from "../infrastructure/persistence/postgres/pg-client";
import { bunPasswordHasher } from "../infrastructure/crypto/password";
import { uuidv7 } from "../shared/utils/id";
import { optionalEnv } from "../shared/utils/env";
import { logger } from "../shared/utils/logger";
import { slugify, slugWithSuffix } from "../shared/utils/slugify";

type RoleKey =
  | "administrator"
  | "analyst"
  | "producer"
  | "individual"
  | "legal_entity";

type SeedUserConfig = {
  email: string;
  password: string;
  roleKey: RoleKey;
  locale: string;
  displayName: string;
  documentType: string;
  documentNumber: string;
  phone: string;
  countryCode: string;
  addressLine1: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
  about: string;
  websiteUrl?: string;
  instagramUrl?: string;
  linkedinUrl?: string;
};

type SeedAreaConfig = {
  name: string;
  description: string;
  biome: string;
  state: string;
  city: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  totalCapacityTco2e: number;
  committedTco2e: number;
  tco2ePerTreePerYear: number;
  pricePerTree: number;
  defaultHorizonYears: number;
  status: "active" | "pending_audit";
  auditStatus: "approved" | "pending";
};

type SeedCalculationConfig = {
  profileType: "individual" | "legal_entity";
  periodStart: string;
  periodEnd: string;
  totalKgCo2e: number;
  totalTco2e: number;
  calculationMethod: string;
  dataQuality: "real" | "estimated" | "standard";
  factorsVersion: string;
  status: "draft" | "finalized";
  finalizedAt: Date | null;
  items: Array<{
    category:
      | "energy"
      | "fuel"
      | "transport"
      | "flights"
      | "scope1"
      | "scope2"
      | "scope3";
    activityType: string;
    quantity: number;
    unit: string;
    kgCo2e: number;
    metadata?: Record<string, unknown> | null;
  }>;
};

const now = new Date();
const defaultPassword =
  optionalEnv("E2E_SEED_PASSWORD") ?? "E2E-ClimaBalance-2026!";

const seedUsers: Record<string, SeedUserConfig> = {
  supporter: {
    email:
      optionalEnv("E2E_SEED_USER_EMAIL") ?? "e2e.supporter@climabalance.local",
    password: optionalEnv("E2E_SEED_USER_PASSWORD") ?? defaultPassword,
    roleKey: "individual",
    locale: "pt-BR",
    displayName: "Apoiador E2E",
    documentType: "cpf",
    documentNumber: "11122233344",
    phone: "+55 61 99999-1001",
    countryCode: "BR",
    addressLine1: "Rua das Sementes, 101",
    addressCity: "Brasilia",
    addressState: "DF",
    addressPostalCode: "70000-001",
    addressCountry: "BR",
    about: "Conta de apoio dedicada aos testes end-to-end.",
    websiteUrl: "https://climabalance.org/e2e-supporter",
    instagramUrl: "https://instagram.com/climabalance.e2e",
    linkedinUrl: "https://linkedin.com/company/climabalance",
  },
  admin: {
    email:
      optionalEnv("E2E_SEED_ADMIN_EMAIL") ?? "e2e.admin@climabalance.local",
    password: optionalEnv("E2E_SEED_ADMIN_PASSWORD") ?? defaultPassword,
    roleKey: "administrator",
    locale: "pt-BR",
    displayName: "Administrador E2E",
    documentType: "cpf",
    documentNumber: "11122233345",
    phone: "+55 61 99999-1002",
    countryCode: "BR",
    addressLine1: "Rua das Auditorias, 200",
    addressCity: "Brasilia",
    addressState: "DF",
    addressPostalCode: "70000-002",
    addressCountry: "BR",
    about: "Conta administrativa para testes E2E.",
    websiteUrl: "https://climabalance.org/e2e-admin",
  },
  analyst: {
    email:
      optionalEnv("E2E_SEED_ANALYST_EMAIL") ?? "e2e.analyst@climabalance.local",
    password: optionalEnv("E2E_SEED_ANALYST_PASSWORD") ?? defaultPassword,
    roleKey: "analyst",
    locale: "pt-BR",
    displayName: "Analista E2E",
    documentType: "cpf",
    documentNumber: "11122233346",
    phone: "+55 61 99999-1003",
    countryCode: "BR",
    addressLine1: "Rua das Aprovações, 300",
    addressCity: "Brasilia",
    addressState: "DF",
    addressPostalCode: "70000-003",
    addressCountry: "BR",
    about: "Conta de analista para auditoria de áreas em E2E.",
    linkedinUrl: "https://linkedin.com/company/climabalance",
  },
  producer: {
    email:
      optionalEnv("E2E_SEED_PRODUCER_EMAIL") ??
      "e2e.producer@climabalance.local",
    password: optionalEnv("E2E_SEED_PRODUCER_PASSWORD") ?? defaultPassword,
    roleKey: "producer",
    locale: "pt-BR",
    displayName: "Reflorestador E2E",
    documentType: "cpf",
    documentNumber: "11122233347",
    phone: "+55 61 99999-1004",
    countryCode: "BR",
    addressLine1: "Estrada do Cerrado, km 12",
    addressCity: "Alto Paraiso",
    addressState: "GO",
    addressPostalCode: "73770-000",
    addressCountry: "BR",
    about: "Conta de produtor para fluxos de áreas e plantio em E2E.",
    websiteUrl: "https://climabalance.org/e2e-producer",
    instagramUrl: "https://instagram.com/reflorestador.e2e",
  },
  legalEntity: {
    email:
      optionalEnv("E2E_SEED_LEGAL_EMAIL") ?? "e2e.legal@climabalance.local",
    password: optionalEnv("E2E_SEED_LEGAL_PASSWORD") ?? defaultPassword,
    roleKey: "legal_entity",
    locale: "pt-BR",
    displayName: "Empresa E2E",
    documentType: "cnpj",
    documentNumber: "12345678000199",
    phone: "+55 11 4000-1005",
    countryCode: "BR",
    addressLine1: "Avenida Corporativa, 500",
    addressCity: "Sao Paulo",
    addressState: "SP",
    addressPostalCode: "01000-000",
    addressCountry: "BR",
    about: "Pessoa juridica usada em fluxos corporativos E2E.",
    websiteUrl: "https://climabalance.org/e2e-legal",
    linkedinUrl: "https://linkedin.com/company/climabalance",
  },
};

const seedAreas: SeedAreaConfig[] = [
  {
    name: "Area Ativa E2E Cerrado",
    description:
      "Area ativa preparada para compra de arvores, checkout e historico de compensacoes.",
    biome: "cerrado",
    state: "GO",
    city: "Alto Paraiso",
    countryCode: "BR",
    latitude: -14.1352,
    longitude: -47.5101,
    totalCapacityTco2e: 320,
    committedTco2e: 24,
    tco2ePerTreePerYear: 0.028,
    pricePerTree: 15,
    defaultHorizonYears: 20,
    status: "active",
    auditStatus: "approved",
  },
  {
    name: "Area Pendente E2E Amazonia",
    description:
      "Area pendente de auditoria para fluxos administrativos e de aprovacao.",
    biome: "amazonia",
    state: "AM",
    city: "Manaus",
    countryCode: "BR",
    latitude: -3.119,
    longitude: -60.0217,
    totalCapacityTco2e: 180,
    committedTco2e: 0,
    tco2ePerTreePerYear: 0.031,
    pricePerTree: 18,
    defaultHorizonYears: 20,
    status: "pending_audit",
    auditStatus: "pending",
  },
];

const finalizedCalculation: SeedCalculationConfig = {
  profileType: "individual",
  periodStart: "2025-01-01T00:00:00.000Z",
  periodEnd: "2025-12-31T23:59:59.999Z",
  totalKgCo2e: 7800,
  totalTco2e: 7.8,
  calculationMethod: "ghg_protocol_guided_v1",
  dataQuality: "real",
  factorsVersion: "2026.01",
  status: "finalized",
  finalizedAt: new Date("2025-05-10T15:30:00.000Z"),
  items: [
    {
      category: "energy",
      activityType: "electricity",
      quantity: 3600,
      unit: "kwh",
      kgCo2e: 1800,
      metadata: { annualized: true },
    },
    {
      category: "transport",
      activityType: "transport_car_medium",
      quantity: 15000,
      unit: "km",
      kgCo2e: 6000,
      metadata: { vehicle_type: "car_medium", fuel_type: "gasoline" },
    },
  ],
};

const draftCalculation: SeedCalculationConfig = {
  profileType: "individual",
  periodStart: "2025-01-01T00:00:00.000Z",
  periodEnd: "2025-12-31T23:59:59.999Z",
  totalKgCo2e: 1900,
  totalTco2e: 1.9,
  calculationMethod: "guest_estimate_v1",
  dataQuality: "estimated",
  factorsVersion: "2026.01",
  status: "draft",
  finalizedAt: null,
  items: [
    {
      category: "energy",
      activityType: "electricity",
      quantity: 1800,
      unit: "kwh",
      kgCo2e: 900,
      metadata: { annualized: true },
    },
    {
      category: "transport",
      activityType: "transport_car_medium",
      quantity: 5000,
      unit: "km",
      kgCo2e: 1000,
      metadata: { vehicle_type: "car_medium", fuel_type: "gasoline" },
    },
  ],
};

async function ensureRole(client: any, roleKey: RoleKey): Promise<string> {
  const definitions: Record<RoleKey, { name: string; description: string }> = {
    administrator: {
      name: "Administrator",
      description: "System administrator with full access.",
    },
    analyst: {
      name: "Analyst",
      description: "User who can audit and approve areas.",
    },
    producer: {
      name: "Producer",
      description: "User who can create and manage areas.",
    },
    individual: {
      name: "Individual",
      description: "Individual user profile.",
    },
    legal_entity: {
      name: "Legal entity",
      description: "Company or organization profile.",
    },
  };

  const existing = await client.query(
    `SELECT id, deleted_at FROM roles WHERE role_key = $1`,
    [roleKey],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const roleId = String(existing.rows[0].id);
    await client.query(
      `UPDATE roles
       SET name = $2,
           description = $3,
           deleted_at = NULL,
           updated_at = $4
       WHERE id = $1`,
      [
        roleId,
        definitions[roleKey].name,
        definitions[roleKey].description,
        now,
      ],
    );
    return roleId;
  }

  const roleId = uuidv7();
  await client.query(
    `INSERT INTO roles (id, role_key, name, description, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)`,
    [
      roleId,
      roleKey,
      definitions[roleKey].name,
      definitions[roleKey].description,
      now,
    ],
  );
  return roleId;
}

async function ensureUniqueUserSlug(
  client: any,
  base: string,
  userId: string,
): Promise<string> {
  const existing = await client.query(
    `SELECT id FROM users WHERE slug = $1 AND id <> $2 AND deleted_at IS NULL`,
    [base, userId],
  );
  if (!existing.rowCount) return base;
  return slugWithSuffix(base, userId);
}

async function ensureUser(
  client: any,
  config: SeedUserConfig,
): Promise<{ id: string; roleId: string; slug: string }> {
  const passwordHash = await bunPasswordHasher.hash(config.password);
  const roleId = await ensureRole(client, config.roleKey);

  const existing = await client.query(`SELECT id FROM users WHERE email = $1`, [
    config.email,
  ]);

  const userId =
    existing.rowCount && existing.rowCount > 0
      ? String(existing.rows[0].id)
      : uuidv7();
  const slugBase = slugify(config.displayName || config.email.split("@")[0]);
  const slug = await ensureUniqueUserSlug(client, slugBase, userId);

  if (existing.rowCount && existing.rowCount > 0) {
    await client.query(
      `UPDATE users
       SET password_hash = $1,
           slug = $2,
           status = 'active',
           locale = $3,
           email_confirmed_at = $4,
           deleted_at = NULL,
           updated_at = $4
       WHERE id = $5`,
      [passwordHash, slug, config.locale, now, userId],
    );
  } else {
    await client.query(
      `INSERT INTO users (
        id, email, password_hash, slug, status, locale, email_confirmed_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $6, $6)`,
      [userId, config.email, passwordHash, slug, config.locale, now],
    );
  }

  const existingRole = await client.query(
    `SELECT id FROM user_roles WHERE user_id = $1 AND role_id = $2`,
    [userId, roleId],
  );

  if (existingRole.rowCount && existingRole.rowCount > 0) {
    await client.query(
      `UPDATE user_roles
       SET deleted_at = NULL,
           updated_at = $3
       WHERE user_id = $1 AND role_id = $2`,
      [userId, roleId, now],
    );
  } else {
    await client.query(
      `INSERT INTO user_roles (id, user_id, role_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [uuidv7(), userId, roleId, now],
    );
  }

  await client.query(
    `INSERT INTO user_profiles (
      id, user_id, display_name, document_type, document_number, phone,
      country_code, address_line1, address_city, address_state, address_postal_code,
      address_country, about, website_url, instagram_url, linkedin_url, created_at, updated_at, deleted_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17, NULL)
    ON CONFLICT (user_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      document_type = EXCLUDED.document_type,
      document_number = EXCLUDED.document_number,
      phone = EXCLUDED.phone,
      country_code = EXCLUDED.country_code,
      address_line1 = EXCLUDED.address_line1,
      address_city = EXCLUDED.address_city,
      address_state = EXCLUDED.address_state,
      address_postal_code = EXCLUDED.address_postal_code,
      address_country = EXCLUDED.address_country,
      about = EXCLUDED.about,
      website_url = EXCLUDED.website_url,
      instagram_url = EXCLUDED.instagram_url,
      linkedin_url = EXCLUDED.linkedin_url,
      deleted_at = NULL,
      updated_at = EXCLUDED.updated_at`,
    [
      uuidv7(),
      userId,
      config.displayName,
      config.documentType,
      config.documentNumber,
      config.phone,
      config.countryCode,
      config.addressLine1,
      config.addressCity,
      config.addressState,
      config.addressPostalCode,
      config.addressCountry,
      config.about,
      config.websiteUrl ?? null,
      config.instagramUrl ?? null,
      config.linkedinUrl ?? null,
      now,
    ],
  );

  if (config.roleKey === "producer") {
    await client.query(
      `INSERT INTO producer_profiles (id, user_id, farm_name, farm_size_ha, notes, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6, NULL)
       ON CONFLICT (user_id) DO UPDATE SET
         farm_name = EXCLUDED.farm_name,
         farm_size_ha = EXCLUDED.farm_size_ha,
         notes = EXCLUDED.notes,
         deleted_at = NULL,
         updated_at = EXCLUDED.updated_at`,
      [
        uuidv7(),
        userId,
        "Fazenda E2E do Cerrado",
        145.5,
        "Perfil de produtor mantido apenas para automacao E2E.",
        now,
      ],
    );
  }

  await ensureConsent(client, userId, "privacy_policy", "2026-04-24");
  await ensureConsent(client, userId, "terms_of_use", "2026-01");

  return { id: userId, roleId, slug };
}

async function ensureConsent(
  client: any,
  userId: string,
  consentType: string,
  version: string,
): Promise<void> {
  const existing = await client.query(
    `SELECT id FROM user_consents WHERE user_id = $1 AND consent_type = $2 AND deleted_at IS NULL`,
    [userId, consentType],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    await client.query(
      `UPDATE user_consents
       SET consented = TRUE,
           version = $3,
           updated_at = $4
       WHERE user_id = $1 AND consent_type = $2 AND deleted_at IS NULL`,
      [userId, consentType, version, now],
    );
    return;
  }

  await client.query(
    `INSERT INTO user_consents (
      id, user_id, consent_type, consented, version, ip_address, created_at, updated_at
    ) VALUES ($1, $2, $3, TRUE, $4, $5, $6, $6)`,
    [uuidv7(), userId, consentType, version, "127.0.0.1", now],
  );
}

async function ensureArea(
  client: any,
  ownerUserId: string,
  config: SeedAreaConfig,
): Promise<{ id: string; slug: string }> {
  const existing = await client.query(
    `SELECT id FROM areas WHERE name = $1 AND deleted_at IS NULL`,
    [config.name],
  );
  const areaId =
    existing.rowCount && existing.rowCount > 0
      ? String(existing.rows[0].id)
      : uuidv7();
  const baseSlug = slugify(config.name);
  const auditedAt = config.auditStatus === "approved" ? now : null;
  const slugQuery = await client.query(
    `SELECT id FROM areas WHERE slug = $1 AND id <> $2 AND deleted_at IS NULL`,
    [baseSlug, areaId],
  );
  const slug = slugQuery.rowCount ? slugWithSuffix(baseSlug, areaId) : baseSlug;

  if (existing.rowCount && existing.rowCount > 0) {
    await client.query(
      `UPDATE areas
       SET owner_user_id = $2,
           name = $3,
           slug = $4,
           description = $5,
           location = ST_SetSRID(ST_MakePoint($6, $7), 4326),
           biome = $8,
           state = $9,
           city = $10,
           country_code = $11,
           status = $12,
           audit_status = $13::varchar,
           audited_at = $14::timestamp,
           total_capacity_t_co2e = $15,
           committed_t_co2e = $16,
           t_co2e_per_tree_per_year = $17,
           price_per_tree = $18,
           default_horizon_years = $19,
           updated_at = $20,
           deleted_at = NULL
       WHERE id = $1`,
      [
        areaId,
        ownerUserId,
        config.name,
        slug,
        config.description,
        config.longitude,
        config.latitude,
        config.biome,
        config.state,
        config.city,
        config.countryCode,
        config.status,
        config.auditStatus,
        auditedAt,
        config.totalCapacityTco2e,
        config.committedTco2e,
        config.tco2ePerTreePerYear,
        config.pricePerTree,
        config.defaultHorizonYears,
        now,
      ],
    );
  } else {
    await client.query(
      `INSERT INTO areas (
        id, owner_user_id, name, slug, description, location, biome, state, city, country_code,
        status, audit_status, audited_at, total_capacity_t_co2e, committed_t_co2e,
        t_co2e_per_tree_per_year, price_per_tree, default_horizon_years, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326), $8, $9, $10, $11,
        $12, $13::varchar, $14::timestamp, $15, $16, $17, $18, $19, $20, $20
      )`,
      [
        areaId,
        ownerUserId,
        config.name,
        slug,
        config.description,
        config.longitude,
        config.latitude,
        config.biome,
        config.state,
        config.city,
        config.countryCode,
        config.status,
        config.auditStatus,
        auditedAt,
        config.totalCapacityTco2e,
        config.committedTco2e,
        config.tco2ePerTreePerYear,
        config.pricePerTree,
        config.defaultHorizonYears,
        now,
      ],
    );
  }

  return { id: areaId, slug };
}

async function ensureCalculation(
  client: any,
  userId: string,
  config: SeedCalculationConfig,
): Promise<string> {
  const existing = await client.query(
    `SELECT id
     FROM footprint_calculations
     WHERE user_id = $1
       AND calculation_method = $2
       AND status = $3
       AND deleted_at IS NULL`,
    [userId, config.calculationMethod, config.status],
  );

  const calculationId =
    existing.rowCount && existing.rowCount > 0
      ? String(existing.rows[0].id)
      : uuidv7();

  if (existing.rowCount && existing.rowCount > 0) {
    await client.query(
      `UPDATE footprint_calculations
       SET profile_type = $2,
           period_start = $3,
           period_end = $4,
           total_kg_co2e = $5,
           total_t_co2e = $6,
           unit = 'tCO2e',
           calculation_method = $7,
           data_quality = $8,
           factors_version = $9,
           status = $10,
           finalized_at = $11,
           updated_at = $12,
           deleted_at = NULL
       WHERE id = $1`,
      [
        calculationId,
        config.profileType,
        config.periodStart,
        config.periodEnd,
        config.totalKgCo2e,
        config.totalTco2e,
        config.calculationMethod,
        config.dataQuality,
        config.factorsVersion,
        config.status,
        config.finalizedAt,
        now,
      ],
    );
  } else {
    await client.query(
      `INSERT INTO footprint_calculations (
        id, user_id, profile_type, period_start, period_end, total_kg_co2e, total_t_co2e,
        unit, calculation_method, data_quality, factors_version, status, finalized_at,
        created_at, updated_at, deleted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'tCO2e', $8, $9, $10, $11, $12, $13, $13, NULL
      )`,
      [
        calculationId,
        userId,
        config.profileType,
        config.periodStart,
        config.periodEnd,
        config.totalKgCo2e,
        config.totalTco2e,
        config.calculationMethod,
        config.dataQuality,
        config.factorsVersion,
        config.status,
        config.finalizedAt,
        now,
      ],
    );
  }

  await client.query(
    `UPDATE footprint_input
     SET deleted_at = $2,
         updated_at = $2
     WHERE calculation_id = $1
       AND deleted_at IS NULL`,
    [calculationId, now],
  );

  await client.query(
    `UPDATE footprint_result_breakdown
     SET deleted_at = $2,
         updated_at = $2
     WHERE calculation_id = $1
       AND deleted_at IS NULL`,
    [calculationId, now],
  );

  for (const item of config.items) {
    await client.query(
      `INSERT INTO footprint_input (
        id, calculation_id, activity_type, category, quantity, unit, kg_co2e, metadata_json,
        created_at, updated_at, deleted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, NULL)`,
        [
          uuidv7(),
          calculationId,
          item.activityType,
          item.category,
          item.quantity,
          item.unit,
          item.kgCo2e,
          item.metadata ? JSON.stringify(item.metadata) : null,
          now,
        ],
    );
  }

  const breakdownTotals = new Map<string, number>();
  for (const item of config.items) {
    breakdownTotals.set(
      item.category,
      (breakdownTotals.get(item.category) ?? 0) + item.kgCo2e,
    );
  }

  for (const [category, kgCo2e] of breakdownTotals.entries()) {
    await client.query(
      `INSERT INTO footprint_result_breakdown (
        id, calculation_id, category, kg_co2e, t_co2e, created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $6, NULL)`,
      [uuidv7(), calculationId, category, kgCo2e, kgCo2e / 1000, now],
    );
  }

  return calculationId;
}

async function ensureCompensationFixture(
  client: any,
  supporterUserId: string,
  areaId: string,
  calculationId: string,
): Promise<void> {
  const existing = await client.query(
    `SELECT id FROM compensations
     WHERE supporter_user_id = $1
       AND area_id = $2
       AND calculation_id = $3
       AND compensation_mode = 'tree_purchase'
       AND deleted_at IS NULL`,
    [supporterUserId, areaId, calculationId],
  );

  const compensationId =
    existing.rowCount && existing.rowCount > 0
      ? String(existing.rows[0].id)
      : uuidv7();

  if (existing.rowCount && existing.rowCount > 0) {
    await client.query(
      `UPDATE compensations
       SET total_co2_kg = $2,
           total_t_co2e = $3,
           total_amount = $4,
           currency = 'BRL',
           status = 'paid',
           compensation_mode = 'tree_purchase',
           horizon_years = $5,
           trees_requested = $6,
           trees_count = $6,
           price_per_tree = $7,
           estimated_total_t_co2e = $3,
           updated_at = $8,
           deleted_at = NULL
       WHERE id = $1`,
      [compensationId, 5000, 5, 750, 20, 50, 15, now],
    );
  } else {
    await client.query(
      `INSERT INTO compensations (
        id, supporter_user_id, area_id, calculation_id, total_co2_kg, total_t_co2e, total_amount,
        currency, status, compensation_mode, horizon_years, trees_requested, trees_count,
        price_per_tree, estimated_total_t_co2e, created_at, updated_at, deleted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'BRL', 'paid', 'tree_purchase', $8, $9, $9, $10, $6, $11, $11, NULL
      )`,
      [
        compensationId,
        supporterUserId,
        areaId,
        calculationId,
        5000,
        5,
        750,
        20,
        50,
        15,
        now,
      ],
    );
  }

  const existingPayment = await client.query(
    `SELECT id FROM payments WHERE compensation_id = $1 AND deleted_at IS NULL`,
    [compensationId],
  );

  if (existingPayment.rowCount && existingPayment.rowCount > 0) {
    await client.query(
      `UPDATE payments
       SET provider = 'pix',
           provider_reference = $2,
           amount = $3,
           currency = 'BRL',
           status = 'paid',
           paid_at = $4,
           updated_at = $4
       WHERE id = $1`,
      [String(existingPayment.rows[0].id), "pix-e2e-paid-001", 750, now],
    );
  } else {
    await client.query(
      `INSERT INTO payments (
        id, compensation_id, provider, provider_reference, amount, currency, status, paid_at, created_at, updated_at
      ) VALUES ($1, $2, 'pix', $3, $4, 'BRL', 'paid', $5, $5, $5)`,
      [uuidv7(), compensationId, "pix-e2e-paid-001", 750, now],
    );
  }

  const certificateResult = await client.query(
    `SELECT id FROM certificates WHERE compensation_id = $1 AND deleted_at IS NULL`,
    [compensationId],
  );

  if (certificateResult.rowCount && certificateResult.rowCount > 0) {
    await client.query(
      `UPDATE certificates
       SET certificate_number = $2,
           authenticity_hash = $3,
           issued_at = $4,
           status = 'issued',
           updated_at = $4
       WHERE id = $1`,
      [
        String(certificateResult.rows[0].id),
        "CERT-E2E-001",
        "hash-e2e-cert-001",
        now,
      ],
    );
  } else {
    await client.query(
      `INSERT INTO certificates (
        id, compensation_id, certificate_number, authenticity_hash, issued_at, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'issued', $5, $5)`,
      [uuidv7(), compensationId, "CERT-E2E-001", "hash-e2e-cert-001", now],
    );
  }
}

const client = await pgPool.connect();

try {
  await client.query("BEGIN");
  logger.info("seed.e2e.start");

  const supporter = await ensureUser(client, seedUsers.supporter);
  const admin = await ensureUser(client, seedUsers.admin);
  const analyst = await ensureUser(client, seedUsers.analyst);
  const producer = await ensureUser(client, seedUsers.producer);
  const legalEntity = await ensureUser(client, seedUsers.legalEntity);

  const activeArea = await ensureArea(client, producer.id, seedAreas[0]);
  await ensureArea(client, producer.id, seedAreas[1]);

  const finalizedCalculationId = await ensureCalculation(
    client,
    supporter.id,
    finalizedCalculation,
  );
  await ensureCalculation(client, supporter.id, draftCalculation);
  await ensureCompensationFixture(
    client,
    supporter.id,
    activeArea.id,
    finalizedCalculationId,
  );

  await client.query("COMMIT");
  logger.info("seed.e2e.completed", {
    users: {
      supporter: {
        email: seedUsers.supporter.email,
        slug: supporter.slug,
      },
      admin: { email: seedUsers.admin.email, slug: admin.slug },
      analyst: { email: seedUsers.analyst.email, slug: analyst.slug },
      producer: { email: seedUsers.producer.email, slug: producer.slug },
      legalEntity: {
        email: seedUsers.legalEntity.email,
        slug: legalEntity.slug,
      },
    },
    activeAreaSlug: activeArea.slug,
  });
} catch (error) {
  await client.query("ROLLBACK");
  logger.error("seed.e2e.failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  throw error;
} finally {
  client.release();
  await pgPool.end();
}
