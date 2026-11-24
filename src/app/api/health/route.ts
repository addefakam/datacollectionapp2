import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/health — deployment diagnostic.
 *
 * Unauthenticated by design: it exposes NO user data, only whether the
 * runtime database is reachable and which module tables exist. Purpose:
 * when data collectors report "Failed to load data" / sync failures, this
 * endpoint immediately shows whether the runtime database predates a module
 * (missing table) — the exact failure mode the startup self-heal
 * (db/runtime-migrate.mjs) exists to repair. 500s here mean the server can
 * not reach its database at all.
 */
export async function GET() {
  try {
    const rows = await db.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const existing = new Set(rows.map((r) => r.name));
    const required = [
      'User',
      'GuestHouse',
      'Industry',
      'HealthCenter',
      'EducationCenter',
      'AgricultureCenter',
      'SmallEnterprise',
      'CharityInitiative',
      'Goal',
      'SubCity',
      'SubCityArea',
      'IndustryCategory',
    ];
    const tables: Record<string, boolean> = {};
    for (const t of required) tables[t] = existing.has(t);
    const missing = required.filter((t) => !existing.has(t));

    return NextResponse.json({
      status: missing.length === 0 ? 'ok' : 'degraded',
      database: 'ok',
      tables,
      missingTables: missing,
      hint:
        missing.length === 0
          ? 'All module tables present.'
          : 'Runtime database predates these modules. Restarting the server should trigger the startup self-heal (db/runtime-migrate.mjs) to create them.',
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        database: 'unreachable',
        message: error instanceof Error ? error.message : 'Unknown database error',
        time: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
