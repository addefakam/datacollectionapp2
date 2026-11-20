import { db } from '@/lib/db';
import {
  STATS_ATTRIBUTE_OPTIONS_DEFAULT,
  normalizeStatsAttributeOptions,
  statsAttributeDef,
} from '@/lib/stats-attributes';

// AppSetting keys for the Sector Distribution attribution
export const STATS_ATTRIBUTE_KEY = 'statsSectorDistributionGroupBy';
export const STATS_ATTRIBUTE_OPTIONS_KEY = 'statsAttributeOptions';

export interface StatsAttributeOption {
  key: string;
  label: string;
  description: string;
}

/** Reads the admin-managed option list, falling back to every registry attribute. */
export async function loadAttributeOptions(): Promise<StatsAttributeOption[]> {
  const setting = await db.appSetting.findUnique({ where: { key: STATS_ATTRIBUTE_OPTIONS_KEY } });
  if (setting?.value) {
    try {
      const normalized = normalizeStatsAttributeOptions(JSON.parse(setting.value));
      if (normalized) {
        return normalized.map(({ key, label }) => ({
          key,
          label,
          description: statsAttributeDef(key)!.description,
        }));
      }
    } catch {
      // corrupted JSON — fall through to defaults
    }
  }
  return STATS_ATTRIBUTE_OPTIONS_DEFAULT.map(({ key, label }) => ({
    key,
    label,
    description: statsAttributeDef(key)!.description,
  }));
}

/** Persists the admin-managed option list (already validated/normalized). */
export async function saveAttributeOptions(
  options: { key: string; label: string }[]
): Promise<void> {
  await db.appSetting.upsert({
    where: { key: STATS_ATTRIBUTE_OPTIONS_KEY },
    update: { value: JSON.stringify(options) },
    create: { key: STATS_ATTRIBUTE_OPTIONS_KEY, value: JSON.stringify(options) },
  });
}
