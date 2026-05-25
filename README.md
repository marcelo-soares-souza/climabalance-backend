# ClimaBalance Backend

API backend (Bun + TypeScript + PostgreSQL) for authentication, areas, compensation, certificates, and audit.

## Prerequisites

- Bun `>= 1.3`
- PostgreSQL `>= 14`
- Environment variables configured (see **Environment** section)

## Setup

```bash
cd backend
bun install
```

Create DB (optional if DB already exists):

```bash
bun run db:create
```

Run migrations and seeds:

```bash
bun run migrate
bun run seed:roles
bun run seed:admin
bun run seed:map
bun run seed:e2e
```

## Run

```bash
cd backend
bun run dev
```

API default URL: `http://localhost:3000`

## Tests

```bash
cd backend
bun test
```

## Environment

Required minimum:

- `DATABASE_URL`
- `JWT_SECRET`
- `PASSWORD_PEPPER`
- `EMAIL_FROM`

Common optional:

- `APP_ENV` (`local|staging|production`)
- `APP_PORT` (default `3000`)
- `APP_URL`
- `FRONTEND_URL`
- `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_TTL_SECONDS`
- `EMAIL_CONFIRM_TTL_MINUTES`, `PASSWORD_RESET_TTL_MINUTES`
- `REFRESH_TOKEN_TTL_DAYS`
- SMTP: `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`

### Object storage

Local storage (default):

- `OBJECT_STORAGE_DRIVER=local` (or unset)
- `AREA_MEDIA_STORAGE_PATH` (optional, default `./storage/area-media`)
- `CERTIFICATE_STORAGE_PATH` (optional, default `./storage/certificates`)

## MVP docs

- Endpoints: `docs/MVP_ENDPOINTS.md`
- Main flows and known limits: `docs/MVP_MAIN_FLOWS_AND_LIMITS.md`
