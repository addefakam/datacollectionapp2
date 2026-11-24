/**
 * Bun fallback for scripts/generate-runtime-schema.py — byte-compatible output.
 *
 * Why this exists: `npm run build` generates db/schema-runtime.json (the
 * startup self-heal snapshot consumed by db/runtime-migrate.mjs). The python
 * step relies on python3 being present in the BUILD environment, but the
 * platform build image only guarantees bun (start.sh and build.sh are
 * bun-based). If python3 is missing there, the build used to fail entirely —
 * leaving the previous (broken) artifact deployed while the fix never shipped.
 *
 * package.json wires it as:  python3 ... || bun scripts/generate-runtime-schema-bun.mjs
 * so either runtime produces the snapshot. Keep both scripts in sync.
 *
 * Reads db/custom.db, writes db/schema-runtime.json: every table (CREATE ...
 * IF NOT EXISTS sql + column list), every named index (IF NOT EXISTS sql),
 * and seed rows for reference tables (only applied by runtime-migrate.mjs
 * when the target table is empty — user data is never touched).
 */
import { Database } from 'bun:sqlite';
import { fileURLToPath } from 'url';
import path from 'path';

const PROJECT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB_PATH = path.join(PROJECT, 'db', 'custom.db');
const OUT_PATH = path.join(PROJECT, 'db', 'schema-runtime.json');

// Reference data seeded ONLY when the target table is empty (never overwrites
// user data). Must match SEED_TABLES in the python version.
const SEED_TABLES = ['SubCity', 'SubCityArea', 'IndustryCategory'];

function wrapIfNotExists(sql) {
  const marker = 'CREATE TABLE ';
  const upper = sql.toUpperCase();
  if (upper.startsWith(marker.toUpperCase())) {
    return 'CREATE TABLE IF NOT EXISTS ' + sql.slice(marker.length);
  }
  return sql;
}

function wrapIndexIfNotExists(sql) {
  const u = sql.toUpperCase();
  if (u.startsWith('CREATE UNIQUE INDEX ')) {
    return 'CREATE UNIQUE INDEX IF NOT EXISTS ' + sql.slice('CREATE UNIQUE INDEX '.length);
  }
  if (u.startsWith('CREATE INDEX ')) {
    return 'CREATE INDEX IF NOT EXISTS ' + sql.slice('CREATE INDEX '.length);
  }
  return sql;
}

const db = new Database(DB_PATH, { readonly: true });

const tables = {};
const tableRows = db
  .query(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name"
  )
  .all();
for (const row of tableRows) {
  const cols = db
    .query(`PRAGMA table_info("${row.name}")`)
    .all()
    .map((c) => ({
      name: c.name,
      type: c.type,
      notnull: !!c.notnull,
      dflt: c.dflt_value ?? null,
      pk: !!c.pk,
    }));
  tables[row.name] = { createSql: wrapIfNotExists(row.sql), columns: cols };
}

const indexes = db
  .query("SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name")
  .all()
  .map((r) => wrapIndexIfNotExists(r.sql));

const seeds = {};
for (const t of SEED_TABLES) {
  if (!tables[t]) continue;
  seeds[t] = db.query(`SELECT * FROM "${t}"`).all();
}
db.close();

const out = {
  generatedFrom: 'db/custom.db (schema snapshot for runtime self-heal)',
  tables,
  indexes,
  seeds,
};
const { writeFileSync } = await import('fs');
writeFileSync(OUT_PATH, JSON.stringify(out, null, 1), 'utf-8');

const seedCounts = Object.fromEntries(Object.entries(seeds).map(([k, v]) => [k, v.length]));
console.log(
  `schema-runtime.json written: ${Object.keys(tables).length} tables, ` +
    `${indexes.length} indexes, seeds: ${JSON.stringify(seedCounts)}`
);
