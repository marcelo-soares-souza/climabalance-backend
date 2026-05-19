import { pgPool } from "../infrastructure/persistence/postgres/pg-client";
import type { PoolClient } from "pg";
import { bunPasswordHasher } from "../infrastructure/crypto/password";
import { uuidv7 } from "../shared/utils/id";
import { optionalEnv } from "../shared/utils/env";
import { logger } from "../shared/utils/logger";

type SeedArea = {
  name: string;
  description: string;
  biome: string;
  state: string;
  city: string;
  latitude: number;
  longitude: number;
  totalCapacity: number;
  tCO2ePerTreePerYear: number;
};

type SchemaVariant = "current" | "legacy";

const seedAreas: SeedArea[] = [
  {
    name: "Fazenda Esperanca Verde",
    description:
      "Area de reflorestamento no Cerrado com foco em especies nativas.",
    biome: "cerrado",
    state: "DF",
    city: "Brasilia",
    latitude: -15.7939,
    longitude: -47.8828,
    totalCapacity: 1500,
    tCO2ePerTreePerYear: 0.025,
  },
  {
    name: "Projeto Rio Negro",
    description:
      "Projeto de conservacao e reflorestamento na regiao do Rio Negro.",
    biome: "amazonia",
    state: "AM",
    city: "Manaus",
    latitude: -3.119,
    longitude: -60.0217,
    totalCapacity: 2200,
    tCO2ePerTreePerYear: 0.03,
  },
  {
    name: "Reserva Mata Atlantica Sul",
    description: "Recuperacao de area degradada na Mata Atlantica.",
    biome: "mata_atlantica",
    state: "SP",
    city: "Sao Paulo",
    latitude: -23.5505,
    longitude: -46.6333,
    totalCapacity: 1200,
    tCO2ePerTreePerYear: 0.022,
  },
  {
    name: "Caatinga Sustentavel",
    description:
      "Iniciativa de reflorestamento e manejo sustentavel no semi-arido.",
    biome: "caatinga",
    state: "BA",
    city: "Juazeiro",
    latitude: -9.416,
    longitude: -40.5036,
    totalCapacity: 900,
    tCO2ePerTreePerYear: 0.018,
  },
  {
    name: "Pantanal Vivo",
    description: "Protecao e restauracao de areas de transicao no Pantanal.",
    biome: "pantanal",
    state: "MS",
    city: "Corumba",
    latitude: -19.0093,
    longitude: -57.6533,
    totalCapacity: 1600,
    tCO2ePerTreePerYear: 0.024,
  },
  {
    name: "Serra do Pampa",
    description:
      "Projeto de reflorestamento com foco em campos nativos do Pampa.",
    biome: "pampa",
    state: "RS",
    city: "Porto Alegre",
    latitude: -30.0346,
    longitude: -51.2177,
    totalCapacity: 1100,
    tCO2ePerTreePerYear: 0.02,
  },
];

const ownerIdEnv = optionalEnv("SEED_OWNER_ID");
const ownerEmail = optionalEnv("SEED_OWNER_EMAIL") ?? "map.seed@example.com";
const ownerPassword = optionalEnv("SEED_OWNER_PASSWORD") ?? "ChangeMe123!";
const ownerLocale = optionalEnv("SEED_OWNER_LOCALE") ?? "pt-BR";

const now = new Date();

async function getAreasTableColumns(client: PoolClient): Promise<Set<string>> {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'areas'`,
  );
  return new Set(result.rows.map((row) => row.column_name as string));
}

function detectSchema(columns: Set<string>): SchemaVariant {
  if (columns.has("owner_user_id")) {
    return "current";
  }
  if (columns.has("producer_id")) {
    return "legacy";
  }
  throw new Error(
    "Unsupported areas schema: missing owner_user_id/producer_id",
  );
}

async function resolveOwnerId(client: PoolClient): Promise<string> {
  if (ownerIdEnv) {
    const ownerResult = await client.query(
      `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [ownerIdEnv],
    );
    if (!ownerResult.rowCount) {
      throw new Error(`Owner user not found for SEED_OWNER_ID=${ownerIdEnv}`);
    }
    return ownerIdEnv;
  }

  const byEmail = await client.query(
    `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [ownerEmail],
  );
  if (byEmail.rowCount && byEmail.rowCount > 0) {
    return byEmail.rows[0].id as string;
  }

  const passwordHash = await bunPasswordHasher.hash(ownerPassword);
  const newUserId = uuidv7();
  await client.query(
    `INSERT INTO users (id, email, password_hash, status, locale, email_confirmed_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $6)`,
    [newUserId, ownerEmail, passwordHash, "active", ownerLocale, now],
  );
  return newUserId;
}

async function upsertArea(
  client: PoolClient,
  ownerUserId: string,
  area: SeedArea,
  columns: Set<string>,
  variant: SchemaVariant,
): Promise<void> {
  const nameColumn = columns.has("name") ? "name" : "area_name";
  const ownerColumn = columns.has("owner_user_id")
    ? "owner_user_id"
    : "producer_id";
  const hasAuditStatus = columns.has("audit_status");
  const hasState = columns.has("state");
  const hasCity = columns.has("city");
  const hasCapacity = columns.has("total_capacity_t_co2e");
  const hasCommitted = columns.has("committed_t_co2e");
  const hasTco2e = columns.has("t_co2e_per_tree_per_year");
  const statusValue = variant === "current" ? "active" : "approved";

  const existing = await client.query(
    `SELECT id FROM areas WHERE ${nameColumn} = $1 AND deleted_at IS NULL`,
    [area.name],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const areaId = existing.rows[0].id as string;
    const values: Array<string | number | null | Date> = [];
    const setClauses: string[] = [];
    const addSet = (column: string, value: string | number | null | Date) => {
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    };

    addSet(ownerColumn, ownerUserId);
    addSet("description", area.description);
    values.push(area.latitude);
    values.push(area.longitude);
    setClauses.push(
      `location = ST_SetSRID(ST_MakePoint($${values.length}, $${values.length - 1}), 4326)`,
    );
    addSet("biome", area.biome);
    if (hasState) addSet("state", area.state);
    if (hasCity) addSet("city", area.city);
    addSet("status", statusValue);
    if (hasAuditStatus) addSet("audit_status", "approved");
    if (hasCapacity) addSet("total_capacity_t_co2e", area.totalCapacity);
    if (hasCommitted) addSet("committed_t_co2e", 0);
    if (hasTco2e) addSet("t_co2e_per_tree_per_year", area.tCO2ePerTreePerYear);
    addSet("updated_at", now);
    addSet("deleted_at", null);

    const whereIndex = values.length + 1;
    values.push(areaId);

    await client.query(
      `UPDATE areas SET ${setClauses.join(", ")} WHERE id = $${whereIndex}`,
      values,
    );
    return;
  }

  const insertColumns: string[] = [
    "id",
    ownerColumn,
    nameColumn,
    "description",
    "location",
    "biome",
  ];
  if (hasState) insertColumns.push("state");
  if (hasCity) insertColumns.push("city");
  insertColumns.push("status");
  if (hasAuditStatus) insertColumns.push("audit_status");
  if (hasCapacity) insertColumns.push("total_capacity_t_co2e");
  if (hasCommitted) insertColumns.push("committed_t_co2e");
  if (hasTco2e) insertColumns.push("t_co2e_per_tree_per_year");
  insertColumns.push("created_at", "updated_at");

  const insertValues: Array<string | number | null | Date> = [
    uuidv7(),
    ownerUserId,
    area.name,
    area.description,
    area.latitude,
    area.longitude,
    area.biome,
  ];
  if (hasState) insertValues.push(area.state);
  if (hasCity) insertValues.push(area.city);
  insertValues.push(statusValue);
  if (hasAuditStatus) insertValues.push("approved");
  if (hasCapacity) insertValues.push(area.totalCapacity);
  if (hasCommitted) insertValues.push(0);
  if (hasTco2e) insertValues.push(area.tCO2ePerTreePerYear);
  insertValues.push(now, now);

  const placeholders = [];
  let paramIdx = 1;
  for (const col of insertColumns) {
    if (col === "location") {
      placeholders.push(
        `ST_SetSRID(ST_MakePoint($${paramIdx + 1}, $${paramIdx}), 4326)`,
      );
      paramIdx += 2;
    } else {
      placeholders.push(`$${paramIdx}`);
      paramIdx += 1;
    }
  }
  await client.query(
    `INSERT INTO areas (${insertColumns.join(", ")}) VALUES (${placeholders})`,
    insertValues,
  );
}

const client = await pgPool.connect();
try {
  await client.query("BEGIN");
  logger.info("seed.map_areas.start", { count: seedAreas.length });

  const columns = await getAreasTableColumns(client);
  const variant = detectSchema(columns);
  if (variant === "legacy") {
    logger.warn("seed.map_areas.legacy_schema", {
      message:
        "Legacy areas schema detected. Consider running migration 005 to enable map features.",
    });
  }
  const ownerUserId = await resolveOwnerId(client);

  for (const area of seedAreas) {
    await upsertArea(client, ownerUserId, area, columns, variant);
  }

  await client.query("COMMIT");
  logger.info("seed.map_areas.completed", { ownerUserId });
} catch (error) {
  await client.query("ROLLBACK");
  logger.error("seed.map_areas.failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  throw error;
} finally {
  client.release();
  await pgPool.end();
}
