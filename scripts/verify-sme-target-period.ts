/**
 * E2E harness for the SME performance dashboard "Target 0, Registered 1" fix.
 *
 * Boots against a REAL PostgreSQL (scripts/e2e-pg-up.sh) and replicates the
 * production target rows captured in scripts/restore-sme-targets.ts:
 *   CITY 2026 = 2000, SUB_CITY Debaayyuu 2026 = 100, five WOREDA shares of 20,
 *   all stored with UTC-midnight period boundaries.
 *
 * Verifies loadSmeTargetsForPeriod() — the period-matching helper the
 * performance dashboard uses — under:
 *   1. UTC server boundaries            (targets resolve)
 *   2. UTC+3-shifted boundaries         (targets STILL resolve — the bug:
 *      exact datetime matching zeroed every row here -> "Target 0, Registered 1")
 *   3. next-year boundaries             (no match — different period)
 *   4. timezone-drifted duplicate rows  (nearest periodStart wins, never 200)
 *   5. case/padding-different scope names (normalized keys match)
 * Plus computeSmeTargetProgress() registered-in-period = 1.
 */
import { PrismaClient } from '@prisma/client';
import {
  loadSmeTargetsForPeriod,
  smeTargetScopeKey,
  computeSmeTargetProgress,
} from '../src/lib/sme-server';
import { smePeriodRange } from '../src/lib/sme';

const db = new PrismaClient();

let pass = 0;
let fail = 0;
const ok = (m: string) => { pass++; console.log(`PASS: ${m}`); };
const bad = (m: string) => { fail++; console.log(`FAIL: ${m}`); };
function expect(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) ok(`${name} = ${actual}`);
  else bad(`${name} — got ${actual}, expected ${expected}`);
}

const UTC_START = new Date('2026-01-01T00:00:00.000Z');
const UTC_END = new Date('2026-12-31T23:59:59.999Z');
// Boundaries a server in Africa/Addis_Ababa (UTC+3) computes for yearly 2026
const EAT_START = new Date('2025-12-31T21:00:00.000Z');
const EAT_END = new Date('2026-12-31T20:59:59.999Z');

async function main() {
  // --- clean slate ---------------------------------------------------------
  await db.smeTarget.deleteMany();
  await db.smallEnterprise.deleteMany();
  await db.subCityArea.deleteMany();
  await db.subCity.deleteMany();

  // --- settings-style locations (same names as production) -----------------
  const debaayyuu = await db.subCity.create({
    data: { name: 'Debaayyuu', sortOrder: 1, areas: { create: [
      { name: 'Dhakaa Boora', sortOrder: 1 },
      { name: 'Dirree', sortOrder: 2 },
      { name: 'Horaa', sortOrder: 3 },
      { name: 'Biiftuu', sortOrder: 4 },
      { name: 'dhankaka', sortOrder: 5 },
    ] } },
  });
  await db.subCity.create({ data: { name: 'Dukam', sortOrder: 2, areas: { create: [
    { name: 'Odaa Nabee', sortOrder: 1 }, { name: 'Xaddachaa', sortOrder: 2 },
  ] } } });
  await db.subCity.create({ data: { name: 'Chelaleka', sortOrder: 3, areas: { create: [
    { name: 'Erere', sortOrder: 1 }, { name: 'Arsadee', sortOrder: 2 },
  ] } } });

  // --- production-replica targets (UTC-midnight boundaries) ----------------
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

  // --- one registered SME (the "Registered 1") ------------------------------
  await db.smallEnterprise.create({ data: {
    enterpriseName: 'E2E TAILOR SHOP', enterpriseType: 'Manufacturing', ownershipType: 'SME',
    subCity: 'Debaayyuu', area: 'Horaa', specificAddress: 'Main street',
    employeeCount: 5, maleEmployees: 2, femaleEmployees: 3,
    contactName: 'Owner', contactPhone: '0911112223', status: 'REGISTERED',
  } });

  // --- 1. pure key normalization -------------------------------------------
  expect('scopeKey("Debaayyuu")', smeTargetScopeKey('Debaayyuu'), 'debaayyuu||');
  expect('scopeKey(" Debaayyuu ", "Horaa")', smeTargetScopeKey(' Debaayyuu ', ' Horaa '), 'debaayyuu||horaa');

  // --- 2. UTC server boundaries ---------------------------------------------
  const utc = await loadSmeTargetsForPeriod('SUB_CITY', 'yearly', UTC_START, UTC_END);
  expect('UTC: sub-city Debaayyuu target', utc.get('debaayyuu||')?.targetValue, 100);
  const utcCity = await loadSmeTargetsForPeriod('CITY', 'yearly', UTC_START, UTC_END);
  expect('UTC: city-wide target', utcCity.get(smeTargetScopeKey('', ''))?.targetValue, 2000);
  const utcWoreda = await loadSmeTargetsForPeriod('WOREDA', 'yearly', UTC_START, UTC_END);
  expect('UTC: woreda Horaa target', utcWoreda.get('debaayyuu||horaa')?.targetValue, 20);
  expect('UTC: woreda count', utcWoreda.size, 5);

  // --- 3. UTC+3-shifted boundaries (the reported-bug scenario) --------------
  const eat = await loadSmeTargetsForPeriod('SUB_CITY', 'yearly', EAT_START, EAT_END);
  expect('UTC+3: sub-city Debaayyuu target (fix proof)', eat.get('debaayyuu||')?.targetValue, 100);
  const eatCity = await loadSmeTargetsForPeriod('CITY', 'yearly', EAT_START, EAT_END);
  expect('UTC+3: city-wide target (fix proof)', eatCity.get(smeTargetScopeKey('', ''))?.targetValue, 2000);
  const eatWoreda = await loadSmeTargetsForPeriod('WOREDA', 'yearly', EAT_START, EAT_END);
  expect('UTC+3: woreda Horaa target (fix proof)', eatWoreda.get('debaayyuu||horaa')?.targetValue, 20);

  // --- 4. next year: no match ------------------------------------------------
  const y2027 = smePeriodRange('yearly', new Date('2027-06-15T12:00:00.000Z'));
  const none = await loadSmeTargetsForPeriod('SUB_CITY', 'yearly', y2027.start, y2027.end);
  expect('2027 period: no sub-city targets', none.size, 0);

  // --- 5. monthly period does not catch the yearly target --------------------
  const nov26 = smePeriodRange('monthly', new Date('2026-11-15T12:00:00.000Z'));
  const monthly = await loadSmeTargetsForPeriod('SUB_CITY', 'monthly', nov26.start, nov26.end);
  expect('monthly period: no targets', monthly.size, 0);

  // --- 6. timezone-drifted duplicate: nearest periodStart wins ---------------
  await db.smeTarget.create({ data: {
    level: 'SUB_CITY', subCity: 'Debaayyuu', area: '', periodType: 'yearly',
    periodStart: EAT_START, periodEnd: EAT_END, targetValue: 77,
    note: 'duplicate created under a shifted timezone',
  } });
  const dupUtc = await loadSmeTargetsForPeriod('SUB_CITY', 'yearly', UTC_START, UTC_END);
  expect('duplicate: UTC query picks nearest (100, not 177)', dupUtc.get('debaayyuu||')?.targetValue, 100);
  const dupEat = await loadSmeTargetsForPeriod('SUB_CITY', 'yearly', EAT_START, EAT_END);
  expect('duplicate: UTC+3 query picks nearest (77, not 177)', dupEat.get('debaayyuu||')?.targetValue, 77);

  // --- 7. case/padding-different scope name still resolves -------------------
  await db.smeTarget.create({ data: {
    level: 'SUB_CITY', subCity: 'debaayyuu ', area: '', periodType: 'quarterly',
    periodStart: new Date('2026-10-01T00:00:00.000Z'), periodEnd: new Date('2026-12-31T23:59:59.999Z'),
    targetValue: 55,
  } });
  const q4 = smePeriodRange('quarterly', new Date('2026-11-15T12:00:00.000Z'));
  const caseRow = await loadSmeTargetsForPeriod('SUB_CITY', 'quarterly', q4.start, q4.end);
  expect('case/padded name resolves for Debaayyuu', caseRow.get('debaayyuu||')?.targetValue, 55);

  // --- 8. registered-in-period still counts the one record -------------------
  const progress = await computeSmeTargetProgress({
    level: 'SUB_CITY', subCity: 'Debaayyuu', area: '', periodType: 'yearly',
    periodStart: UTC_START, periodEnd: UTC_END, targetValue: 100,
  });
  expect('registered in yearly period', progress.actual, 1);
  expect('achievement %', progress.achievementPct, 1);
  expect('standing total', progress.standing.total, 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`seeded subCity id: ${debaayyuu.id}`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
