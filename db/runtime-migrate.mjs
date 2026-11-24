/**
 * Runtime database self-heal — runs at every production startup (see
 * .zscripts/start.sh) BEFORE the Next.js server boots.
 *
 * Why: the deployment may point DATABASE_URL at a database that predates
 * recent modules (SmallEnterprise / Goal / CharityInitiative...). Missing
 * tables made every module API return 500 — surveys stuck "waiting for sync"
 * and every records page showed "Failed to load data". This script syncs the
 * ACTIVE runtime database to the build-time schema snapshot
 * (db/schema-runtime.json):
 *
 *   1. creates missing tables / indexes  (CREATE ... IF NOT EXISTS)
 *   2. adds missing columns              (ALTER TABLE ADD COLUMN)
 *   3. seeds reference data (sub-cities, areas, industry categories) ONLY
 *      when the target table is empty — user data is NEVER touched.
 *
 * Idempotent and fully tolerant: any failure logs a warning and exits 0 so
 * startup is never blocked (the app then behaves exactly as before).
 *
 * Resolution notes: start.sh runs this with cwd = next-service-dist/, so
 * @prisma/client resolves from the standalone bundle's node_modules and the
 * DATABASE_URL env var is already exported.
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import path from 'path';

function log(msg) {
  console.log(`[runtime-migrate] ${msg}`);
}

async function main() {
  let plan;
  try {
    const schemaPath = path.resolve(process.cwd(), '..', 'db', 'schema-runtime.json');
    plan = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  } catch (e) {
    log(`schema snapshot not found or unreadable (${e.message}) — skipping`);
    return;
  }

  let Client;
  try {
    // Resolve @prisma/client the same way the standalone server does.
    const req = createRequire(path.join(process.cwd(), 'server.js'));
    ({ PrismaClient: Client } = req('@prisma/client'));
  } catch (e) {
    log(`@prisma/client unavailable (${e.message}) — skipping`);
    return;
  }

  // Same normalization as src/lib/db.ts: the platform may inject a bare path
  // ("/app/db/custom.db") — Prisma rejects URLs without the file: protocol.
  if (
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.startsWith('file:') &&
    !process.env.DATABASE_URL.includes('://')
  ) {
    log(`DATABASE_URL lacks the file: protocol — normalizing "${process.env.DATABASE_URL}"`);
    process.env.DATABASE_URL = `file:${process.env.DATABASE_URL}`;
  }

  const db = new Client({
    datasources: process.env.DATABASE_URL
      ? { db: { url: process.env.DATABASE_URL } }
      : undefined,
  });

  const created = [];
  const altered = [];
  const seeded = [];
  const failures = [];

  try {
    const existing = await db.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    const existingNames = new Set(existing.map((r) => r.name));

    // 1. missing tables
    for (const [name, def] of Object.entries(plan.tables || {})) {
      if (existingNames.has(name)) continue;
      try {
        await db.$executeRawUnsafe(def.createSql);
        created.push(name);
      } catch (e) {
        failures.push(`create ${name}: ${e.message}`);
      }
    }

    // 2. missing columns (ALTER ADD COLUMN; skip PK / NOT NULL without default)
    for (const [name, def] of Object.entries(plan.tables || {})) {
      let have;
      try {
        have = new Set(
          (await db.$queryRawUnsafe(`PRAGMA table_info("${name}")`)).map((r) => r.name)
        );
      } catch {
        continue; // table unknown — already handled above
      }
      for (const col of def.columns || []) {
        if (have.has(col.name)) continue;
        if (col.pk) continue; // cannot ADD a pk column; table create covers it
        const parts = [`"${col.name}"`, col.type || 'TEXT'];
        if (col.notnull && col.dflt != null) {
          parts.push('NOT NULL', `DEFAULT ${col.dflt}`);
        } else if (col.dflt != null) {
          parts.push('DEFAULT', String(col.dflt));
        } else if (col.notnull) {
          // sqlite cannot ADD COLUMN with NOT NULL / non-constant defaults —
          // add the column nullable, then backfill existing rows via UPDATE
          // (UPDATE accepts CURRENT_TIMESTAMP). Prisma client re-manages these
          // fields (e.g. @updatedAt) on every subsequent write.
          const t = (col.type || '').toUpperCase();
          const isTime = t.includes('DATETIME') || t.includes('TIMESTAMP') || t.includes('DATE');
          const isNum = t.includes('BOOL') || t.includes('INT') || t.includes('REAL') ||
            t.includes('FLOA') || t.includes('DOUB') || t.includes('NUM');
          try {
            await db.$executeRawUnsafe(`ALTER TABLE "${name}" ADD COLUMN ${parts.join(' ')}`);
            await db.$executeRawUnsafe(
              `UPDATE "${name}" SET "${col.name}" = ${isTime ? 'CURRENT_TIMESTAMP' : isNum ? '0' : "''"} WHERE "${col.name}" IS NULL`
            );
            altered.push(`${name}.${col.name}`);
          } catch (e) {
            failures.push(`alter ${name}.${col.name}: ${e.message}`);
          }
          continue;
        }
        try {
          await db.$executeRawUnsafe(`ALTER TABLE "${name}" ADD COLUMN ${parts.join(' ')}`);
          altered.push(`${name}.${col.name}`);
        } catch (e) {
          failures.push(`alter ${name}.${col.name}: ${e.message}`);
        }
      }
    }

    // 3. indexes
    for (const sql of plan.indexes || []) {
      try {
        await db.$executeRawUnsafe(sql);
      } catch {
        /* index already exists or incompatible — ignore */
      }
    }

    // 4. reference seeds — only into EMPTY tables, parameterised
    for (const [table, rows] of Object.entries(plan.seeds || {})) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      try {
        const cnt = await db.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "${table}"`);
        if (Number(cnt[0]?.c) > 0) continue;
        const cols = Object.keys(rows[0]);
        const colList = cols.map((c) => `"${c}"`).join(', ');
        for (const row of rows) {
          const ph = cols.map(() => '?').join(', ');
          await db.$executeRawUnsafe(
            `INSERT INTO "${table}" (${colList}) VALUES (${ph})`,
            ...cols.map((c) => row[c] ?? null)
          );
        }
        seeded.push(`${table}(${rows.length})`);
      } catch (e) {
        failures.push(`seed ${table}: ${e.message}`);
      }
    }
  } catch (e) {
    failures.push(`fatal: ${e.message}`);
  } finally {
    try {
      await db.$disconnect();
    } catch {
      /* ignore */
    }
  }

  if (created.length) log(`created tables: ${created.join(', ')}`);
  if (altered.length) log(`added columns: ${altered.join(', ')}`);
  if (seeded.length) log(`seeded: ${seeded.join(', ')}`);
  if (failures.length) log(`WARNINGS: ${failures.join(' | ')}`);
  if (!created.length && !altered.length && !seeded.length && !failures.length) {
    log('schema already up to date');
  }
}

main().catch((e) => log(`skipped (${e.message})`)).finally(() => process.exit(0));
