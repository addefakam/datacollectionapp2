import { PrismaClient } from '@prisma/client'
import { existsSync } from 'fs'

/**
 * Resolve the runtime database URL for this SQLite-only application.
 *
 * The deployment platform may inject DATABASE_URL in forms the SQLite Prisma
 * client cannot use:
 *   - a bare filesystem path ("/app/db/custom.db")          → prefix file:
 *   - a full non-SQLite URL (e.g. postgresql://… — the platform's managed
 *     Postgres)                                             → this app has no
 *     postgres schema, so fall back to the PACKAGED runtime database that
 *     ships with the deployment (file:/app/db/custom.db). That file lives on
 *     the instance's persistent volume — it is the store this app has always
 *     used in production (its schema is kept current by the startup
 *     self-heal db/runtime-migrate.mjs).
 *
 * Dev environments (.env with a valid file: URL) are never touched.
 */
function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL
  if (!url || url.startsWith('file:')) return url

  if (!url.includes('://')) {
    // Bare path — just add the protocol.
    process.env.DATABASE_URL = `file:${url}`
    return process.env.DATABASE_URL
  }

  // Non-file URL (postgresql:// etc.): SQLite client cannot use it. Fall back
  // to the packaged database when running in the deployment layout. The
  // packaged path comes from PACKAGED_DB_PATH (exported by .zscripts/start.sh)
  // and defaults to the deployment's fixed location.
  const packaged = process.env.PACKAGED_DB_PATH || '/app/db/custom.db'
  if (existsSync(packaged)) {
    process.env.DATABASE_URL = `file:${packaged}`
  }
  // Otherwise leave the value untouched — Prisma's error is then visible in
  // /api/health instead of a silently wrong path.
  return process.env.DATABASE_URL
}

resolveDatabaseUrl()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
