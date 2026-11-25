import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const rows = await db.smallEnterprise.findMany({ select: { enterpriseName: true, maleEmployees: true, femaleEmployees: true, employeeCount: true } });
  console.log(JSON.stringify(rows));
}
main().finally(() => db.$disconnect());
