#!/usr/bin/env bash
set -euo pipefail

MAX_RETRIES=${DB_MAX_RETRIES:-30}
SLEEP_SECONDS=${DB_RETRY_SLEEP_SECONDS:-2}
DATABASE_URL=${DATABASE_URL:-}
DB_HOST=${DB_HOST:-}
DB_SKIP_DNS_CHECK=${DB_SKIP_DNS_CHECK:-1}

if [ -z "${DB_HOST}" ] && [ -n "${DATABASE_URL}" ]; then
  DB_HOST=$(echo "${DATABASE_URL}" | sed -E 's#^[a-zA-Z0-9+.-]+://[^@]+@([^:/]+).*#\\1#')
fi

if [ "${DB_SKIP_DNS_CHECK}" != "1" ] && [ -n "${DB_HOST}" ]; then
  if command -v getent >/dev/null 2>&1; then
    attempt=1
    until getent hosts "${DB_HOST}" >/dev/null 2>&1; do
      if [ "${attempt}" -ge "${MAX_RETRIES}" ]; then
        echo "DB host not resolvable: ${DB_HOST}"
        exit 1
      fi
      echo "Waiting for DB DNS... attempt ${attempt}/${MAX_RETRIES}"
      attempt=$((attempt + 1))
      sleep "${SLEEP_SECONDS}"
    done
  elif command -v nslookup >/dev/null 2>&1; then
    attempt=1
    until nslookup "${DB_HOST}" >/dev/null 2>&1; do
      if [ "${attempt}" -ge "${MAX_RETRIES}" ]; then
        echo "DB host not resolvable: ${DB_HOST}"
        exit 1
      fi
      echo "Waiting for DB DNS... attempt ${attempt}/${MAX_RETRIES}"
      attempt=$((attempt + 1))
      sleep "${SLEEP_SECONDS}"
    done
  else
    echo "Skipping DNS check (no resolver tool found)."
  fi
fi

attempt=1
until bun run db:create; do
  if [ "${attempt}" -ge "${MAX_RETRIES}" ]; then
    echo "DB not ready after ${MAX_RETRIES} attempts"
    exit 1
  fi
  echo "Waiting for DB... attempt ${attempt}/${MAX_RETRIES}"
  attempt=$((attempt + 1))
  sleep "${SLEEP_SECONDS}"
done

if [ "${RUN_MIGRATIONS_ON_STARTUP:-0}" = "1" ]; then
  bun run migrate
else
  echo "Skipping automatic migrations on startup (RUN_MIGRATIONS_ON_STARTUP!=1)"
fi
exec bun run start
