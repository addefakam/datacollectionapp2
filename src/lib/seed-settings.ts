import { db } from '@/lib/db';
import { locationData, SECTORS } from './location-data';

/**
 * Ensures the admin-managed settings tables (sub-cities, areas, industry
 * categories) contain data. On a fresh deployment they are seeded from the
 * original hardcoded lists in location-data.ts, so existing behaviour is
 * preserved. Idempotent — only writes when a table is empty.
 */
export async function ensureSettingsSeeded(): Promise<void> {
  const subCityCount = await db.subCity.count();
  if (subCityCount === 0) {
    for (let i = 0; i < locationData.subCities.length; i++) {
      const sc = locationData.subCities[i];
      await db.subCity.create({
        data: {
          name: sc.name,
          sortOrder: i,
          areas: {
            create: sc.areas.map((areaName, j) => ({
              name: areaName,
              sortOrder: j,
            })),
          },
        },
      });
    }
  }

  const categoryCount = await db.industryCategory.count();
  if (categoryCount === 0) {
    for (let i = 0; i < SECTORS.length; i++) {
      await db.industryCategory.create({
        data: { name: SECTORS[i], sortOrder: i },
      });
    }
  }
}
