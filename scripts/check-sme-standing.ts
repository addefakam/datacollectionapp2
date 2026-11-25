import { PrismaClient } from '@prisma/client';
import { smeScopeStanding, smeRegisteredInPeriod } from '../src/lib/sme-server';
import { smePeriodRange } from '../src/lib/sme';

const db = new PrismaClient();
async function main() {
  // What the dashboard computes for every managed unit (city overview)
  const subCities = await db.subCity.findMany({ include: { areas: true }, orderBy: { sortOrder: 'asc' } });
  for (const sc of subCities) {
    const standing = await smeScopeStanding(sc.name);
    console.log(`SUB-CITY ${sc.name}: total=${standing.total} byStatus=${JSON.stringify(standing.byStatus)} members=${standing.members}`);
    for (const a of sc.areas) {
      const s2 = await smeScopeStanding(sc.name, a.name);
      console.log(`  woreda ${a.name}: total=${s2.total} byStatus=${JSON.stringify(s2.byStatus)}`);
    }
  }
  const all = await smeScopeStanding();
  console.log('CITY-WIDE:', JSON.stringify(all));
  const { start, end } = smePeriodRange('yearly', new Date());
  const inPeriod = await smeRegisteredInPeriod(undefined, undefined, start, end);
  console.log(`registered in yearly period ${start.toISOString()}..${end.toISOString()}: ${inPeriod}`);
}
main().finally(() => db.$disconnect());
