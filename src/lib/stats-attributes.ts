/**
 * Registry of attributes the Industry "Sector Distribution" chart can group by.
 *
 * The three original dimensions (category / woreda / employees) are computed
 * from fixed aggregations; the rest use a generic Prisma groupBy on the Industry
 * model fields. Admins manage which options appear (and their labels) in
 * Settings → Stats (AppSetting "statsAttributeOptions"); the chart only offers
 * enabled options. This registry is the source of truth for valid keys, so a
 * stale admin list can never break the chart.
 */

export interface StatsAttributeDef {
  /** Stable identifier stored in AppSetting (e.g. 'category'). */
  key: string;
  /** Default bilingual label (admins can override it). */
  label: string;
  /** Bilingual description shown as the chart subtitle. */
  description: string;
}

export const STATS_ATTRIBUTES: StatsAttributeDef[] = [
  {
    key: 'category',
    label: 'Category / Goossa',
    description: 'Industries by sector / Goossa armaan gadii',
  },
  {
    key: 'subCity',
    label: 'Sub-City / Kuttaa Maggalaa',
    description: 'Industries by sub-city / Kutaa armaan gadii',
  },
  {
    key: 'woreda',
    label: 'Woreda / Werada',
    description: 'Industries by woreda / Werada armaan gadii',
  },
  {
    key: 'employees',
    label: 'Number of Employees / Lakkoofsa Hojjetaa',
    description: 'Industries by number of employees / Lakkoofsa hojjetaa armaan gadii',
  },
  {
    key: 'ownershipType',
    label: 'Ownership Type / Gosa Abbaa Qabuu',
    description: 'Industries by ownership type / Gosa Abbaa Qabuu armaan gadii',
  },
  {
    key: 'surveyorName',
    label: 'Surveyor / Galmeeffachaa',
    description: 'Industries by surveyor / Namni galmeeffachaa armaan gadii',
  },
];

/** Default admin-managed option list: every registry key with its default label. */
export const STATS_ATTRIBUTE_OPTIONS_DEFAULT: { key: string; label: string }[] =
  STATS_ATTRIBUTES.map(({ key, label }) => ({ key, label }));

export function isStatsAttributeKey(key: unknown): key is string {
  return typeof key === 'string' && STATS_ATTRIBUTES.some((a) => a.key === key);
}

export function statsAttributeDef(key: string): StatsAttributeDef | undefined {
  return STATS_ATTRIBUTES.find((a) => a.key === key);
}

/**
 * Validates an admin-managed options list. Keeps order, trims labels (falls
 * back to the registry default when empty), drops unknown keys and duplicates.
 * Returns null when nothing valid remains (the caller rejects the save).
 */
export function normalizeStatsAttributeOptions(
  raw: unknown
): { key: string; label: string }[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: { key: string; label: string }[] = [];
  for (const item of raw) {
    const key = (item as { key?: unknown })?.key;
    if (!isStatsAttributeKey(key) || seen.has(key)) continue;
    seen.add(key);
    const def = statsAttributeDef(key)!;
    const rawLabel = (item as { label?: unknown })?.label;
    const label =
      typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim().slice(0, 80) : def.label;
    out.push({ key, label });
  }
  return out.length > 0 ? out : null;
}
