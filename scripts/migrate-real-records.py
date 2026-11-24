#!/usr/bin/env python3
"""One-time migration of REAL records from the preview SQLite file into the
production PostgreSQL database (the platform-managed Neon instance).

Scope decisions (PostgreSQL is the authoritative store — it already holds
171 guesthouses, industries, health/education centers and users):
  - MIGRATE: SmallEnterprise (DUKAM FURNITURE WORKS), CharityInitiative
    (HOPE ORPHAN SUPPORT CENTER), Goal (2 targets) — these tables were
    missing from the PostgreSQL schema until prisma db push created them.
  - REMAP: the one SubCityArea present only in SQLite, re-parented to the
    matching PostgreSQL SubCity by NAME (SQLite and PostgreSQL SubCity ids
    differ).
  - SKIP: preview test junk ("GH 1".."GH 5", "ZZLOAD EDU A") — never enters
    production data.

Idempotent: every insert uses ON CONFLICT DO NOTHING; the SubCityArea step
checks for an existing area name first.
"""
import datetime
import os
import sqlite3
import sys

import psycopg2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQLITE_PATH = os.path.join(ROOT, "db", "custom.db")


def load_pg_url():
    for line in open(os.path.join(ROOT, ".env")):
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip()
    return os.environ.get("DATABASE_URL")


def convert(value, pg_type):
    if value is None:
        return None
    if pg_type == "boolean" and isinstance(value, (int, float)):
        return bool(value)
    if pg_type.startswith("timestamp") and isinstance(value, (int, float)):
        secs = value / 1000 if value >= 10**12 else value
        return datetime.datetime.fromtimestamp(secs, tz=datetime.timezone.utc).isoformat()
    return value


def insert_row(cur, table, cols_meta, row):
    names = [k for k in row.keys() if k in cols_meta]
    vals = [convert(row[k], cols_meta[k]) for k in names]
    placeholders = ", ".join(
        f"%s::{cols_meta[k]}" if cols_meta[k].startswith("json") else "%s" for k in names
    )
    col_list = ", ".join(f'"{k}"' for k in names)
    cur.execute(
        f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING',
        vals,
    )
    return cur.rowcount or 0


def main():
    pg = psycopg2.connect(load_pg_url())
    pg.autocommit = True
    cur = pg.cursor()
    s = sqlite3.connect(SQLITE_PATH)
    s.row_factory = sqlite3.Row

    # --- 1. SubCityArea gap (re-parent by SubCity NAME) ---
    cur.execute('SELECT name FROM "SubCityArea"')
    pg_areas = {r[0] for r in cur.fetchall()}
    for a in [dict(r) for r in s.execute("SELECT * FROM SubCityArea")]:
        if a["name"] in pg_areas:
            continue
        parent_name = s.execute(
            "SELECT name FROM SubCity WHERE id=?", (a["subCityId"],)
        ).fetchone()["name"]
        cur.execute('SELECT id FROM "SubCity" WHERE name=%s', (parent_name,))
        row = cur.fetchone()
        if not row:
            print(f"SubCityArea {a['name']}: no parent SubCity '{parent_name}' in PG — skipped")
            continue
        cur.execute('SELECT id FROM "SubCityArea" WHERE name=%s LIMIT 1', (a["name"],))
        if cur.fetchone():
            print(f"SubCityArea {a['name']}: already exists under another SubCity — skipped")
            continue
        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name=%s ORDER BY ordinal_position",
            ("SubCityArea",),
        )
        pgcols = [r[0] for r in cur.fetchall()]
        vals = {k: v for k, v in a.items() if k in pgcols and k != "subCityId"}
        vals["subCityId"] = row[0]
        n = insert_row(cur, "SubCityArea", {c: "text" for c in pgcols}, vals)
        print(f"SubCityArea {a['name']}: {n} inserted (parented to {parent_name})")

    # --- 2. Real records into the newly created tables ---
    for table in ("SmallEnterprise", "Goal", "CharityInitiative"):
        cur.execute(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_name=%s ORDER BY ordinal_position",
            (table,),
        )
        cols_meta = {r[0]: r[1] for r in cur.fetchall()}
        rows = [dict(r) for r in s.execute(f'SELECT * FROM "{table}"')]
        total = sum(insert_row(cur, table, cols_meta, row) for row in rows)
        print(f"{table}: {total}/{len(rows)} inserted")

    s.close()
    pg.close()


if __name__ == "__main__":
    main()
