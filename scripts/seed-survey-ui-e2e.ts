/**
 * Seed the E2E database for the elegant survey interface verification:
 *   • admin/admin123 user
 *   • sub-cities Debaayyuu / Dukam / Chelaleka with their woredas
 *   • the Hotel & Guest House questionnaire carrying the amenity questions
 *     seen in the user's screenshot — Restaurant, Parking, WiFi, Hot Water
 *     (yes/no) and Additional Services (paragraph) — as admin-added custom
 *     questions on step 2, exactly like the production configuration.
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const db = new PrismaClient();

const GH_QUESTIONNAIRE = [
  { key: 'custom_restaurant', labelEn: 'Restaurant', labelOr: 'Maqaa Nyaataa', enabled: true, required: false, custom: true, step: 2, input: 'radio-yesno' },
  { key: 'custom_parking', labelEn: 'Parking', labelOr: 'Pakaangii', enabled: true, required: false, custom: true, step: 2, input: 'radio-yesno' },
  { key: 'custom_wifi', labelEn: 'WiFi', labelOr: 'Wayiifii', enabled: true, required: false, custom: true, step: 2, input: 'radio-yesno' },
  { key: 'custom_hot_water', labelEn: 'Hot Water', labelOr: 'Bishaan Ho\'aa', enabled: true, required: false, custom: true, step: 2, input: 'radio-yesno' },
  { key: 'custom_additional_services', labelEn: 'Additional Services', labelOr: 'Tajaajila Dabalataa', enabled: true, required: false, custom: true, step: 2, input: 'textarea' },
];

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

  await db.subCityArea.deleteMany({});
  await db.subCity.deleteMany({});
  await db.subCity.create({ data: { name: 'Debaayyuu', sortOrder: 1, areas: { create: [
    { name: 'Dhakaa Boora', sortOrder: 1 },
    { name: 'Dirree', sortOrder: 2 },
    { name: 'Horaa', sortOrder: 3 },
    { name: 'Biiftuu', sortOrder: 4 },
  ] } } });
  await db.subCity.create({ data: { name: 'Dukam', sortOrder: 2, areas: { create: [
    { name: 'Odaa Nabee', sortOrder: 1 }, { name: 'Xaddachaa', sortOrder: 2 },
  ] } } });
  await db.subCity.create({ data: { name: 'Chelaleka', sortOrder: 3, areas: { create: [
    { name: 'Erere', sortOrder: 1 }, { name: 'Arsadee', sortOrder: 2 },
  ] } } });

  await db.appSetting.upsert({
    where: { key: 'guesthouseSurveyFields' },
    update: { value: JSON.stringify(GH_QUESTIONNAIRE) },
    create: { key: 'guesthouseSurveyFields', value: JSON.stringify(GH_QUESTIONNAIRE) },
  });

  // Health questionnaire carries one custom yes/no question — proves the
  // elegant shared rendering (QuestionCard + SegmentedYesNo) in other modules.
  const HEALTH_QUESTIONNAIRE = [
    { key: 'custom_has_ambulance', labelEn: 'Ambulance on site', labelOr: 'Ambulaansii jira', enabled: true, required: false, custom: true, step: 1, input: 'radio-yesno' },
  ];
  await db.appSetting.upsert({
    where: { key: 'healthSurveyFields' },
    update: { value: JSON.stringify(HEALTH_QUESTIONNAIRE) },
    create: { key: 'healthSurveyFields', value: JSON.stringify(HEALTH_QUESTIONNAIRE) },
  });

  console.log('seeded: admin, 3 sub-cities, guesthouse questionnaire with 5 amenity questions, health with 1 custom question');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
