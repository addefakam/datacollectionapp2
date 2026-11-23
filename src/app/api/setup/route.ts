import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '@/lib/password';
import { locationData, SECTORS } from '@/lib/location-data';

export const dynamic = 'force-dynamic';

async function ensureTables(prisma: PrismaClient) {
  // Create tables using raw SQL if they don't exist
  // This avoids needing the Prisma CLI on Vercel serverless
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "username" TEXT NOT NULL,
      "password" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'COLLECTOR',
      "assignedSubCity" TEXT,
      "assignedArea" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
  `);

  // Repair older deployments whose User table predates the assignment columns
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assignedSubCity" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assignedArea" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GuestHouse" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "guestHouseName" TEXT NOT NULL,
      "organizationName" TEXT,
      "subCity" TEXT NOT NULL,
      "area" TEXT NOT NULL,
      "specificAddress" TEXT NOT NULL,
      "numberOfRooms" INTEGER NOT NULL,
      "licenseType" TEXT NOT NULL,
      "licenseLevel" TEXT NOT NULL,
      "licenseNumber" TEXT,
      "serviceRating" INTEGER NOT NULL,
      "contactPhone" TEXT,
      "contactName" TEXT,
      "contactPhone2" TEXT,
      "contactName2" TEXT,
      "ownerName" TEXT,
      "hasRestaurant" BOOLEAN NOT NULL DEFAULT false,
      "hasParking" BOOLEAN NOT NULL DEFAULT false,
      "hasWiFi" BOOLEAN NOT NULL DEFAULT false,
      "hasHotWater" BOOLEAN NOT NULL DEFAULT false,
      "additionalServices" TEXT,
      "surveyorName" TEXT,
      "surveyorId" TEXT,
      "signature" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "GuestHouse" ADD COLUMN IF NOT EXISTS "signature" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "GuestHouse" ADD COLUMN IF NOT EXISTS "contactPhone2" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "GuestHouse" ADD COLUMN IF NOT EXISTS "contactName2" TEXT;
  `);

  // Industry module (industry data collection) tables
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Industry" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "establishmentName" TEXT NOT NULL,
      "sector" TEXT NOT NULL,
      "subCity" TEXT NOT NULL,
      "area" TEXT NOT NULL,
      "specificAddress" TEXT NOT NULL,
      "licenseNumber" TEXT,
      "ownershipType" TEXT NOT NULL,
      "employeeCount" INTEGER NOT NULL DEFAULT 0,
      "startupCapital" DOUBLE PRECISION,
      "contactName" TEXT NOT NULL,
      "contactPhone" TEXT NOT NULL,
      "surveyorName" TEXT,
      "surveyorId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
  `);

  // Repair older deployments whose Industry table predates the sex breakdown columns
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Industry" ADD COLUMN IF NOT EXISTS "maleEmployees" INTEGER NOT NULL DEFAULT 0;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Industry" ADD COLUMN IF NOT EXISTS "femaleEmployees" INTEGER NOT NULL DEFAULT 0;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IndustryAttendance" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "meetingId" TEXT NOT NULL,
      "industryId" TEXT NOT NULL,
      "collectorId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ABSENT',
      "markedAt" TIMESTAMP(3) NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "IndustryAttendance_meetingId_industryId_key"
      ON "IndustryAttendance"("meetingId", "industryId");
  `);

  // Settings tables (admin-managed locations & industry categories)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SubCity" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "SubCity_name_key" ON "SubCity"("name");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SubCityArea" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "subCityId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "SubCityArea_subCityId_name_key"
      ON "SubCityArea"("subCityId", "name");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IndustryCategory" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "IndustryCategory_name_key" ON "IndustryCategory"("name");
  `);
}

// Seed the settings tables from the original hardcoded defaults if empty
async function seedSettings(prisma: PrismaClient) {
  const subCityCount = await prisma.subCity.count();
  if (subCityCount === 0) {
    for (let i = 0; i < locationData.subCities.length; i++) {
      const sc = locationData.subCities[i];
      await prisma.subCity.create({
        data: {
          name: sc.name,
          sortOrder: i,
          areas: {
            create: sc.areas.map((areaName, j) => ({ name: areaName, sortOrder: j })),
          },
        },
      });
    }
  }

  const categoryCount = await prisma.industryCategory.count();
  if (categoryCount === 0) {
    for (let i = 0; i < SECTORS.length; i++) {
      await prisma.industryCategory.create({
        data: { name: SECTORS[i], sortOrder: i },
      });
    }
  }
}

export async function POST() {
  const results: string[] = [];

  try {
    const prisma = new PrismaClient();

    try {
      // Step 1: Ensure tables exist via raw SQL
      results.push('Creating tables if needed...');
      await ensureTables(prisma);
      results.push('Tables ready.');

      // Step 1b: Seed admin-managed settings (sub-cities, categories)
      await seedSettings(prisma);
      results.push('Settings seeded (locations & categories).');

      // Step 2: Create admin user if not exists
      results.push('Checking for admin user...');
      const existing = await prisma.user.findUnique({
        where: { username: 'admin' },
      });

      if (existing) {
        results.push('Admin user already exists.');
      } else {
        await prisma.user.create({
          data: {
            username: 'admin',
            password: hashPassword('admin123'),
            name: 'Administrator',
            role: 'ADMIN',
          },
        });
        results.push('Admin user created: admin / admin123');
      }
    } finally {
      await prisma.$disconnect();
    }

    return NextResponse.json({
      success: true,
      message: 'Setup complete! You can now log in.',
      details: results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: msg,
        hint: 'Make sure DATABASE_URL in Vercel env points to your Neon PostgreSQL database and starts with postgresql://',
        details: results,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
