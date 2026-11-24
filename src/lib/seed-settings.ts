import { db } from '@/lib/db';
import { locationData, SECTORS } from './location-data';

/**
 * Ensures the admin-managed settings tables (sub-cities, areas, industry
 * categories) contain data. On a fresh deployment they are seeded from the
 * original hardcoded lists in location-data.ts, so existing behaviour is
 * preserved. Idempotent AND race-safe: concurrent requests (two tabs, double
 * reload) use upserts so a simultaneous seed never hits a unique violation.
 */
export async function ensureSettingsSeeded(): Promise<void> {
  const subCityCount = await db.subCity.count();
  if (subCityCount === 0) {
    for (let i = 0; i < locationData.subCities.length; i++) {
      const sc = locationData.subCities[i];
      // Upsert instead of create: if another request seeded the same row
      // concurrently, this resolves to the existing sub-city instead of throwing.
      const subCity = await db.subCity.upsert({
        where: { name: sc.name },
        update: {},
        create: { name: sc.name, sortOrder: i },
      });
      for (let j = 0; j < sc.areas.length; j++) {
        const areaName = sc.areas[j];
        const existing = await db.subCityArea.findFirst({
          where: { subCityId: subCity.id, name: areaName },
        });
        if (!existing) {
          // P2002 (duplicate) is possible only if two requests insert the same
          // area at the same instant — ignore it, the row exists either way.
          await db.subCityArea
            .create({ data: { subCityId: subCity.id, name: areaName, sortOrder: j } })
            .catch(() => undefined);
        }
      }
    }
  }

  const categoryCount = await db.industryCategory.count();
  if (categoryCount === 0) {
    for (let i = 0; i < SECTORS.length; i++) {
      await db.industryCategory.upsert({
        where: { name: SECTORS[i] },
        update: {},
        create: { name: SECTORS[i], sortOrder: i },
      });
    }
  }
}
