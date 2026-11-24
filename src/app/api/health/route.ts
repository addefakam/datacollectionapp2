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
 *
 * The payload also reports the SHAPE of DATABASE_URL (never a credential —
 * this project only ever uses file: paths) so a misconfigured runtime URL is
 * visible in the response itself.
 */
function describeDatabaseUrl(): Record<string, unknown> {
  const url = process.env.DATABASE_URL;
  if (!url) return { present: false, note: 'DATABASE_URL is not set' };
  return {
    present: true,
    startsWithFileProtocol: url.startsWith('file:'),
    // file: URLs carry a path, not a secret — safe to show for diagnosis.
    value: url.length > 120 ? `${url.slice(0, 120)}…` : url,
  };
}

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

    // hasUsers: login breaks if the runtime database is a fresh empty file
    // (no accounts). A boolean only — never counts or account data.
    let hasUsers: boolean | null = null;
    if (tables.User) {
      const u = await db.$queryRawUnsafe<{ n: number }[]>(
        'SELECT COUNT(*) as n FROM "User"'
      );
      hasUsers = Number(u[0]?.n ?? 0) > 0;
    }

    return NextResponse.json({
      status: missing.length === 0 ? 'ok' : 'degraded',
      database: 'ok',
      databaseUrl: describeDatabaseUrl(),
      tables,
      missingTables: missing,
      hasUsers,
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
        databaseUrl: describeDatabaseUrl(),
        message: error instanceof Error ? error.message : 'Unknown database error',
        time: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
