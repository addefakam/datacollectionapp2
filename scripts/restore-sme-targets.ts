/**
 * One-shot restore of the production SmeTarget rows that the E2E cleanup
 * accidentally deleted (its baseline snapshot truncated at 4,000 chars, so
 * the "keep" list came back empty and every target was removed).
 * Values are the exact ones captured from the live database earlier in this
 * session, restoring the original primary keys so nothing else dangles.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const TARGETS = [
  {
    id: 'cmwwfdhax0000l307kt3h9me5',
    level: 'CITY',
    subCity: '',
    area: '',
    periodType: 'yearly',
    periodStart: new Date('2026-01-01T00:00:00.000Z'),
    periodEnd: new Date('2026-12-31T23:59:59.999Z'),
    targetValue: 2000,
    note: null,
    status: 'ACTIVE',
    createdByName: 'Administrator',
    createdAt: new Date('2026-11-25T17:56:25.690Z'),
    updatedAt: new Date('2026-11-25T17:56:25.690Z'),
  },
  {
    id: 'cmwv19h6a0000l20817x4n5p4',
    level: 'SUB_CITY',
    subCity: 'Debaayyuu',
    area: '',
    periodType: 'yearly',
    periodStart: new Date('2026-01-01T00:00:00.000Z'),
    periodEnd: new Date('2026-12-31T23:59:59.999Z'),
    targetValue: 100,
    note: null,
    status: 'ACTIVE',
    createdByName: 'Administrator',
    createdAt: new Date('2026-11-24T18:33:38.098Z'),
    updatedAt: new Date('2026-11-24T18:33:38.098Z'),
  },
  // WOREDA targets — created by the sub-city distribution seconds later.
  ...['Biiftuu', 'dhankaka', 'Horaa', 'Dirree', 'Dhakaa Boora'].map((area, i) => ({
    id: [
      'cmwv1afs30005l208idqeao5j',
      'cmwv1afr70004l208evuim1nx',
      'cmwv1afqb0003l20838pcw68s',
      'cmwv1afpf0002l208ndx4zr2n',
      'cmwv1afo30001l208sulepoba',
    ][i],
    level: 'WOREDA',
    subCity: 'Debaayyuu',
    area,
    periodType: 'yearly',
    periodStart: new Date('2026-01-01T00:00:00.000Z'),
    periodEnd: new Date('2026-12-31T23:59:59.999Z'),
    targetValue: 20,
    note: 'Distributed from Debaayyuu sub-city target',
    status: 'ACTIVE',
    createdByName: 'Administrator',
    createdAt: new Date('2026-11-24T18:34:00.000Z'),
    updatedAt: new Date('2026-11-24T18:34:00.000Z'),
  })),
];

async function main() {
  let restored = 0;
  for (const t of TARGETS) {
    await db.smeTarget.create({ data: t });
    restored++;
    console.log(`restored ${t.level} ${t.subCity}/${t.area} = ${t.targetValue}`);
  }
  const total = await db.smeTarget.count();
  console.log(`done: ${restored} restored, table now holds ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
