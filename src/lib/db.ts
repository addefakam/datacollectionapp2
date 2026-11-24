import { PrismaClient } from '@prisma/client'

/**
 * PostgreSQL via the platform-managed managed database (Neon).
 *
 * The deployment platform injects DATABASE_URL (postgresql://…) at runtime
 * and the build pushes the Prisma schema (`prisma db push`) against the same
 * database, so no client-side URL rewriting is needed — pass it through.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
