import { PrismaClient } from '@prisma/client'

/**
 * The deployment platform may inject DATABASE_URL as a bare filesystem path
 * (e.g. "/app/db/custom.db") instead of a Prisma file: URL. Prisma then
 * rejects the whole datasource ("the URL must start with the protocol
 * `file:`") and EVERY query fails — that is exactly what /api/health showed
 * on production ("database":"unreachable"). Normalize here so the server
 * self-heals regardless of how it is started (start.sh, npm start, plain
 * node server.js) and of what form the injected variable takes.
 */
function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL
  if (!url || url.startsWith('file:') || url.includes('://')) return url
  // No scheme, not empty → treat as a filesystem path and add the protocol.
  process.env.DATABASE_URL = `file:${url}`
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
