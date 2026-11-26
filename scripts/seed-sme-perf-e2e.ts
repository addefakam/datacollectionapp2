/**
 * Seed the E2E database with the production-replica SME performance scenario:
 *   • admin/admin123 user
 *   • sub-cities Debaayyuu / Dukam / Chelaleka with their woredas
 *   • ACTIVE yearly-2026 targets stored with UTC-midnight boundaries — the
 *     exact rows captured from production in scripts/restore-sme-targets.ts:
 *       CITY 2000, SUB_CITY Debaayyuu 100, five WOREDA shares of 20
 *   • one REGISTERED small enterprise in Debaayyuu / Horaa ("Registered 1")
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const db = new PrismaClient();

const UTC_START = new Date('2026-01-01T00:00:00.000Z');
const UTC_END = new Date('2026-12-31T23:59:59.999Z');

async function main() {
  await db.smeTarget.deleteMany();
  await db.smallEnterprise.deleteMany();
  await db.subCityArea.deleteMany();
  await db.subCity.deleteMany();

  await db.user.upsert({
    where: { username: 'admin' },
    update: { password: createHash('sha256').update('admin123').digest('hex'), role: 'ADMIN' },
    create: {
      username: 'admin',
      password: createHash('sha256').update('admin123').digest('hex'),
      name: 'Administrator',
      role: 'ADMIN',
    },
  });

  await db.subCity.create({ data: { name: 'Debaayyuu', sortOrder: 1, areas: { create: [
    { name: 'Dhakaa Boora', sortOrder: 1 },
    { name: 'Dirree', sortOrder: 2 },
    { name: 'Horaa', sortOrder: 3 },
    { name: 'Biiftuu', sortOrder: 4 },
    { name: 'dhankaka', sortOrder: 5 },
  ] } } });
  await db.subCity.create({ data: { name: 'Dukam', sortOrder: 2, areas: { create: [
    { name: 'Odaa Nabee', sortOrder: 1 }, { name: 'Xaddachaa', sortOrder: 2 },
  ] } } });
  await db.subCity.create({ data: { name: 'Chelaleka', sortOrder: 3, areas: { create: [
    { name: 'Erere', sortOrder: 1 }, { name: 'Arsadee', sortOrder: 2 },
  ] } } });

  await db.smeTarget.create({ data: {
    level: 'CITY', subCity: '', area: '', periodType: 'yearly',
    periodStart: UTC_START, periodEnd: UTC_END, targetValue: 2000,
    createdByName: 'Administrator',
  } });
  await db.smeTarget.create({ data: {
    level: 'SUB_CITY', subCity: 'Debaayyuu', area: '', periodType: 'yearly',
    periodStart: UTC_START, periodEnd: UTC_END, targetValue: 100,
    createdByName: 'Administrator',
  } });
  for (const area of ['Biiftuu', 'dhankaka', 'Horaa', 'Dirree', 'Dhakaa Boora']) {
    await db.smeTarget.create({ data: {
      level: 'WOREDA', subCity: 'Debaayyuu', area, periodType: 'yearly',
      periodStart: UTC_START, periodEnd: UTC_END, targetValue: 20,
      note: 'Distributed from Debaayyuu sub-city target',
    } });
  }

  await db.smallEnterprise.create({ data: {
    enterpriseName: 'E2E TAILOR SHOP', enterpriseType: 'Manufacturing', ownershipType: 'SME',
    subCity: 'Debaayyuu', area: 'Horaa', specificAddress: 'Main street',
    employeeCount: 5, maleEmployees: 2, femaleEmployees: 3,
    contactName: 'Owner', contactPhone: '0911112223', status: 'REGISTERED',
  } });

  console.log('seeded: admin, 3 sub-cities, 7 yearly-2026 targets (UTC bounds), 1 SME record');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
