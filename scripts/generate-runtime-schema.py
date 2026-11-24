#!/usr/bin/env python3
"""
Generate db/schema-runtime.json — a portable snapshot of the CURRENT sqlite
schema (tables, columns, indexes) plus reference seed data (sub-cities,
industry categories).

Consumed at STARTUP by db/runtime-migrate.mjs, which idempotently syncs
whatever database the runtime points at (the platform may inject a DATABASE_URL
that predates recent modules — missing tables there made every module API
return 500 → "Failed to load data" and surveys stuck "waiting for sync").

Run automatically as part of `npm run build` (after prisma db push, before
next build). database-runtime-build.sh ships db/ wholesale into the deploy
artifact, so this file reaches production without extra packaging steps.
"""

import json
import os
import sqlite3

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT, "db", "custom.db")
OUT_PATH = os.path.join(PROJECT, "db", "schema-runtime.json")

# Reference data seeded ONLY when the target table is empty (never overwrites
# user data). Row values come from the current preview database.
SEED_TABLES = ["SubCity", "SubCityArea", "IndustryCategory"]


def wrap_if_not_exists(sql: str) -> str:
    """'CREATE TABLE X (...)' -> 'CREATE TABLE IF NOT EXISTS X (...)'"""
    marker = "CREATE TABLE "
    idx = sql.find(marker)
    if idx == 0:
        return "CREATE TABLE IF NOT EXISTS " + sql[len(marker):]
    marker_u = marker.upper()
    if sql.find(marker_u) == 0:
        return "CREATE TABLE IF NOT EXISTS " + sql[len(marker_u):]
    return sql


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    tables = {}
    for row in cur.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name"
    ).fetchall():
        name = row["name"]
        cols = []
        for c in cur.execute(f'PRAGMA table_info("{name}")').fetchall():
            cols.append({
                "name": c["name"],
                "type": c["type"],
                "notnull": bool(c["notnull"]),
                "dflt": c["dflt_value"],
                "pk": bool(c["pk"]),
            })
        tables[name] = {"createSql": wrap_if_not_exists(row["sql"]), "columns": cols}

    indexes = []
    for row in cur.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='index' "
        "AND sql IS NOT NULL ORDER BY name"
    ).fetchall():
        sql = row["sql"]
        # 'CREATE INDEX X' -> 'CREATE INDEX IF NOT EXISTS X' (also UNIQUE INDEX)
        if sql.upper().startswith("CREATE UNIQUE INDEX "):
            sql = "CREATE UNIQUE INDEX IF NOT EXISTS " + sql[len("CREATE UNIQUE INDEX "):]
        elif sql.upper().startswith("CREATE INDEX "):
            sql = "CREATE INDEX IF NOT EXISTS " + sql[len("CREATE INDEX "):]
        indexes.append(sql)

    seeds = {}
    for t in SEED_TABLES:
        if t not in tables:
            continue
        rows = []
        for r in cur.execute(f'SELECT * FROM "{t}"').fetchall():
            rows.append({k: r[k] for k in r.keys()})
        seeds[t] = rows

    con.close()

    out = {
        "generatedFrom": "db/custom.db (schema snapshot for runtime self-heal)",
        "tables": tables,
        "indexes": indexes,
        "seeds": seeds,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print(
        f"schema-runtime.json written: {len(tables)} tables, "
        f"{len(indexes)} indexes, seeds: { {k: len(v) for k, v in seeds.items()} }"
    )


if __name__ == "__main__":
    main()
