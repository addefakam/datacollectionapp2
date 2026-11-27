/**
 * Seed the E2E database for the Bussa Goonofaa "Record Achievement" flow:
 *   • admin/admin123 user
 *   • departments (offices): Trade & Tourism, Land Management, Health Office,
 *     Small Enterprise Office
 *   • one ACTIVE donation campaign "Bussa Goonofa Fund 2026" distributed
 *     across the offices with minimum amounts — mirrors the production setup
 *     where the coordination office sets the goal and assigns offices.
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const db = new PrismaClient();

async function main() {
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

  const deptNames = ['Trade & Tourism Office', 'Land Management Office', 'Health Office', 'Women & Youth Affairs Office'];
  const departments = [];
  for (const name of deptNames) {
    const d = await db.department.upsert({
      where: { id: `dept-${name.toLowerCase().replace(/[^a-z]+/g, '-')}` },
      update: { name },
      create: { id: `dept-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`, name },
    });
    departments.push(d);
  }

  // clean previous campaign seed
  await db.donationEntry.deleteMany({});
  await db.donationCampaignAssignment.deleteMany({});
  await db.donationCampaign.deleteMany({});

  const now = new Date();
  const campaign = await db.donationCampaign.create({
    data: {
      name: 'Bussa Goonofa Fund 2026',
      description: 'Annual charity fund — cash and in-kind collections across the offices',
      totalGoal: 500000,
      currency: 'ETB',
      kindNote: 'Grain, blankets and livestock are accepted as in-kind',
      startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      deadline: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 28)),
      status: 'ACTIVE',
      createdById: (await db.user.findFirst({ where: { username: 'admin' } }))!.id,
      createdByName: 'Administrator',
      assignments: {
        create: [
          { departmentId: departments[0].id, minimumAmount: 200000, note: 'Collect from traders around Dukam market' },
          { departmentId: departments[1].id, minimumAmount: 150000, note: null },
          { departmentId: departments[2].id, minimumAmount: 150000, note: null },
        ],
      },
    },
    include: { assignments: true },
  });

  console.log(
    `seeded: admin, ${departments.length} departments, campaign "${campaign.name}" with ${campaign.assignments.length} office assignments`
  );
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
