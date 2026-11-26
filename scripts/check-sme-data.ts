import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const total = await db.smallEnterprise.count();
  console.log('Total SmallEnterprise records:', total);
  const byStatus = await db.smallEnterprise.groupBy({ by: ['status'], _count: { _all: true } });
  console.log('groupBy status:', JSON.stringify(byStatus, null, 2));
  const bySubCity = await db.smallEnterprise.groupBy({ by: ['subCity'], _count: { _all: true } });
  console.log('groupBy subCity:', JSON.stringify(bySubCity, null, 2));
  const sample = await db.smallEnterprise.findMany({ take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, enterpriseName: true, subCity: true, area: true, status: true, employeeCount: true, createdAt: true } });
  console.log('Sample records:', JSON.stringify(sample, null, 2));
  const subCities = await db.subCity.findMany({ select: { name: true }, orderBy: { sortOrder: 'asc' } });
  console.log('Managed SubCity names:', JSON.stringify(subCities.map(s => s.name)));
}
main().finally(() => db.$disconnect());
