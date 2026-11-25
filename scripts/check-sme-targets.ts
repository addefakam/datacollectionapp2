import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const targets = await db.smeTarget.findMany({ orderBy: { createdAt: 'desc' } });
  console.log('SmeTarget count:', targets.length);
  for (const t of targets) {
    console.log(JSON.stringify({ id: t.id, level: t.level, subCity: t.subCity, area: t.area, periodType: t.periodType, periodStart: t.periodStart, periodEnd: t.periodEnd, targetValue: t.targetValue, status: t.status }));
  }
}
main().finally(() => db.$disconnect());
