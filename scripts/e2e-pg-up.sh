#!/usr/bin/env bash
# Boot a local PostgreSQL 19 (embedded binaries, no root needed) for E2E.
# Prints the connection URL on the last line. Idempotent: restarts if running.
# NOTE: the binaries ship no psql — the e2e database is created by
# `prisma db push`, which creates missing databases on connect.
set -u
PG_BIN=/home/z/my-project/node_modules/@embedded-postgres/linux-x64/native/bin
PGDATA=/tmp/pgdata-e2e-sme
PGPORT=54329
PGSOCK=/tmp/pgsock-e2e

mkdir -p "$PGSOCK"
if [ ! -d "$PGDATA" ]; then
  "$PG_BIN/initdb" -D "$PGDATA" -U pgadmin -A trust -E UTF8 > /tmp/pgdata-e2e-init.log 2>&1 || {
    echo "initdb failed"; tail -20 /tmp/pgdata-e2e-init.log; exit 1; }
fi

if ! "$PG_BIN/pg_ctl" -D "$PGDATA" status > /dev/null 2>&1; then
  "$PG_BIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k $PGSOCK -c listen_addresses=127.0.0.1" -l /tmp/pgdata-e2e.log start > /tmp/pgdata-e2e-start.log 2>&1 || {
    echo "pg_ctl start failed"; tail -20 /tmp/pgdata-e2e-start.log; exit 1; }
fi

for i in $(seq 1 20); do
  "$PG_BIN/pg_ctl" -D "$PGDATA" status > /dev/null 2>&1 && break
  sleep 1
done
"$PG_BIN/pg_ctl" -D "$PGDATA" status > /dev/null 2>&1 || { echo "postgres failed to stay up"; tail -20 /tmp/pgdata-e2e.log; exit 1; }

echo "postgres ready"
echo "DATABASE_URL=postgresql://pgadmin@127.0.0.1:$PGPORT/e2e_sme"
