import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/health — deployment diagnostic.
 *
 * Unauthenticated by design: it exposes NO user data, only whether the
 * runtime PostgreSQL database is reachable, which module tables exist and
 * whether any user account does. Purpose: when data collectors report
 * "Failed to load data" / sync failures, this endpoint immediately shows
 * whether the runtime database predates a module (missing table). 500s here
 * mean the server can not reach its database at all.
 *
 * The DATABASE_URL value is reported with credentials masked (user:pass@ →
 * ***@) so misconfiguration is visible without leaking secrets.
 */

/** Hide userinfo credentials in URLs (user:pass@host) — never echo secrets. */
function maskUrl(url: string): string {
  return url.replace(/:\/\/[^@/\s]+@/, '://***@');
}

function describeDatabaseUrl(): Record<string, unknown> {
  const url = process.env.DATABASE_URL;
  if (!url) return { present: false, note: 'DATABASE_URL is not set' };
  return {
    present: true,
    isPostgres: url.startsWith('postgresql://') || url.startsWith('postgres://'),
    value: maskUrl(url.length > 120 ? `${url.slice(0, 120)}…` : url),
  };
}

export async function GET() {
  try {
    const rows = await db.$queryRawUnsafe<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    );
    const existing = new Set(rows.map((r) => r.table_name));
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

    // hasUsers: login breaks if the runtime database has no accounts.
    // A boolean only — never counts or account data.
    let hasUsers: boolean | null = null;
    if (tables.User) {
      const u = await db.$queryRawUnsafe<{ n: bigint }[]>(
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
          : 'Runtime database predates these modules — run `prisma db push` against it (the build does this automatically).',
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
