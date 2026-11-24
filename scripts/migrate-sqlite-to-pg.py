#!/usr/bin/env python3
"""One-time data migration: local SQLite (db/custom.db) -> PostgreSQL (Neon).

The deployment platform injects a managed PostgreSQL URL, and the app has
been switched from SQLite to PostgreSQL (prisma schema provider). This
script moves the existing preview data — admin login, reference data
(SubCities / Areas / IndustryCategories) and any records already collected —
into PostgreSQL. Idempotent: ON CONFLICT DO NOTHING on every insert, so it
can be re-run safely.

Type conversion (SQLite -> PostgreSQL):
  INTEGER 0/1 in a boolean column -> false/true
  TEXT JSON strings               -> passed through to jsonb (cast in SQL)
  ISO datetime strings            -> passed through (PG casts to timestamp)

Never prints connection details; reads DATABASE_URL from the environment.
"""
import os
import sqlite3
import sys

import psycopg2

SQLITE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "db", "custom.db")

# Parents before children (FK constraints exist in the PostgreSQL schema).
TABLES = [
    "User",
    "SubCity",
    "SubCityArea",
    "IndustryCategory",
    "AppSetting",
    "Meeting",
    "GuestHouse",
    "Industry",
    "HealthCenter",
    "EducationCenter",
    "AgricultureCenter",
    "SmallEnterprise",
    "CharityInitiative",
    "Goal",
    "CollectorAssignment",
    "Attendance",
    "IndustryAttendance",
]


def pg_columns(cur, table):
    cur.execute(
        """
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
        """,
        (table,),
    )
    return {r[0]: r[1] for r in cur.fetchall()}


def convert(value, pg_type):
    if value is None:
        return None
    if pg_type in ("boolean",):
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.strip() in ("1", "true", "TRUE", "t", "yes")
        return bool(value)
    if pg_type.startswith("timestamp") and isinstance(value, (int, float)):
        # SQLite rows occasionally hold epoch values (seconds or milliseconds)
        # where Prisma normally keeps ISO strings — normalize to ISO.
        from datetime import datetime, timezone
        secs = value / 1000 if value >= 10**12 else value
        return datetime.fromtimestamp(secs, tz=timezone.utc).isoformat()
    return value


def main():
    if not os.environ.get("DATABASE_URL"):
        print("DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)

    src = sqlite3.connect(SQLITE_PATH)
    src.row_factory = sqlite3.Row
    dst = psycopg2.connect(os.environ["DATABASE_URL"])
    dst.autocommit = True
    dcur = dst.cursor()

    total = 0
    for table in TABLES:
        cols = pg_columns(dcur, table)
        if not cols:
            print(f"{table}: not present in PostgreSQL — skipped")
            continue
        try:
            rows = src.execute(f'SELECT * FROM "{table}"').fetchall()
        except sqlite3.OperationalError as e:
            print(f"{table}: missing in SQLite ({e}) — skipped")
            continue
        inserted = 0
        for row in rows:
            names = [c for c in row.keys() if c in cols]
            values = [convert(row[c], cols[c]) for c in names]
            placeholders = ", ".join(
                f"%s::{cols[c]}" if cols[c].startswith("json") else "%s" for c in names
            )
            col_list = ", ".join(f'"{c}"' for c in names)
            sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'
            dcur.execute(sql, values)
            if dcur.statusmessage.startswith("INSERT") and dcur.rowcount:
                inserted += dcur.rowcount
        total += inserted
        print(f"{table}: {len(rows)} rows read, {inserted} inserted")

    print(f"TOTAL inserted: {total}")
    src.close()
    dst.close()


if __name__ == "__main__":
    main()
