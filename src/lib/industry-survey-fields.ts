/**
 * Registry of the Industry survey questionnaire (managed in Settings → Survey).
 *
 * The Industry model has fixed columns, so the questionnaire maps one config
 * entry per payload field. Admins can hide/disable optional questions, flip
 * required flags and edit the bilingual labels; the wizard form, its step
 * validation, the review list and the server-side POST /api/industries
 * validation all follow this config. Core identification fields (name, sector,
 * location, contact) are locked — records would lose their backbone without
 * them. The male/female breakdown counts as ONE question ("employeeSex").
 *
 * Storage: AppSetting "industrySurveyFields" — an ordered array of
 * { key, labelEn, labelOr, enabled, required }. Order within a wizard step
 * follows the saved array order; locked fields keep their registry position.
 */

export type IndustrySurveyInput =
  | 'text'
  | 'number'
  | 'select'
  | 'radio-yesno'
  | 'sex-pair';

export interface IndustrySurveyFieldDef {
  /** Payload field name (matches the Industry column / form field). */
  key: string;
  /** Wizard step the question sits on (1 establishment, 2 registration, 3 contact). */
  step: 1 | 2 | 3;
  /** Default English label. */
  labelEn: string;
  /** Default Afaan Oromoo sub-label. */
  labelOr: string;
  /** How the form renders the question. */
  input: IndustrySurveyInput;
  /** Whether it is required by default. */
  required: boolean;
  /** Cannot be disabled (core identification fields). */
  locked: boolean;
  /** Required flag is fixed (cannot be toggled in Settings). */
  requiredFixed: boolean;
}

export interface IndustrySurveyFieldConfig {
  key: string;
  labelEn: string;
  labelOr: string;
  enabled: boolean;
  required: boolean;
}

export const SURVEY_FIELDS_SETTING_KEY = 'industrySurveyFields';

/** "Employees by Sex" counts male + female as one question. */
export const SEX_PAIR_KEY = 'employeeSex';

export const INDUSTRY_SURVEY_FIELDS: IndustrySurveyFieldDef[] = [
  // ---- Step 1: Establishment ----
  {
    key: 'establishmentName',
    step: 1,
    labelEn: 'Establishment Name',
    labelOr: 'Maqaa Indastrii',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'sector',
    step: 1,
    labelEn: 'Sector / Goossa Indastrii',
    labelOr: 'Goossa',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'subCity',
    step: 1,
    labelEn: 'Sub-City',
    labelOr: 'Kuttaa Maggalaa',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'area',
    step: 1,
    labelEn: 'Woreda',
    labelOr: 'Werreda',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'specificAddress',
    step: 1,
    labelEn: 'Specific Address',
    labelOr: 'Baka Addaa',
    input: 'text',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  // ---- Step 2: Registration & Size ----
  {
    key: 'licenseNumber',
    step: 2,
    labelEn: 'License Number',
    labelOr: 'Lakofsaa Eyyeema',
    input: 'text',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'ownershipType',
    step: 2,
    labelEn: 'Ownership Type / Gosa Abbaa Qabuu',
    labelOr: 'Gosa Abbaa Qabuu',
    input: 'select',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'employeeCount',
    step: 2,
    labelEn: 'Employee Count',
    labelOr: 'Lakkoofsa Hojjetaa',
    input: 'number',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'startupCapital',
    step: 2,
    labelEn: 'Startup Capital (ETB)',
    labelOr: 'Qabiyyee Jalqabaa',
    input: 'number',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: SEX_PAIR_KEY,
    step: 2,
    labelEn: 'Employees by Sex',
    labelOr: 'Hojjetaa Dhiira fi Dubartii',
    input: 'sex-pair',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'hasEia',
    step: 2,
    labelEn: 'EIA — Environmental Impact Assessment',
    labelOr: 'Qorannoo Naannoo',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true, // yes/no always has an answer — required is meaningless
  },
  {
    key: 'hasEmp',
    step: 2,
    labelEn: 'EMP — Environmental Management Plan',
    labelOr: 'Karoora Naannoo',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  // ---- Step 3: Contact ----
  {
    key: 'contactName',
    step: 3,
    labelEn: 'Contact Person',
    labelOr: 'Nama Quunnamtu',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'contactPhone',
    step: 3,
    labelEn: 'Contact Phone',
    labelOr: 'Bilbila Quunnamtii',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
];

/** Default config: every registry question enabled with its default labels. */
export const SURVEY_FIELDS_DEFAULT: IndustrySurveyFieldConfig[] = INDUSTRY_SURVEY_FIELDS.map(
  (f) => ({ key: f.key, labelEn: f.labelEn, labelOr: f.labelOr, enabled: true, required: f.required })
);

export function industrySurveyFieldDef(key: string): IndustrySurveyFieldDef | undefined {
  return INDUSTRY_SURVEY_FIELDS.find((f) => f.key === key);
}

export function isIndustrySurveyFieldKey(key: unknown): key is string {
  return typeof key === 'string' && INDUSTRY_SURVEY_FIELDS.some((f) => f.key === key);
}

/**
 * Validates an admin-managed questionnaire. Keeps the saved order for known
 * keys (per step, since steps are fixed), drops unknown keys and duplicates,
 * forces locked fields enabled and fixed-required fields required, trims
 * labels (falls back to the registry default when empty). Returns null when
 * nothing valid remains (the caller rejects the save).
 */
export function normalizeSurveyFields(
  raw: unknown
): IndustrySurveyFieldConfig[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: IndustrySurveyFieldConfig[] = [];
  for (const item of raw) {
    const key = (item as { key?: unknown })?.key;
    if (!isIndustrySurveyFieldKey(key) || seen.has(key)) continue;
    seen.add(key);
    const def = industrySurveyFieldDef(key)!;
    const labelEn =
      typeof (item as { labelEn?: unknown })?.labelEn === 'string' &&
      (item as { labelEn?: string }).labelEn!.trim()
        ? (item as { labelEn?: string }).labelEn!.trim().slice(0, 120)
        : def.labelEn;
    const labelOr =
      typeof (item as { labelOr?: unknown })?.labelOr === 'string' &&
      (item as { labelOr?: string }).labelOr!.trim()
        ? (item as { labelOr?: string }).labelOr!.trim().slice(0, 120)
        : def.labelOr;
    out.push({
      key,
      labelEn,
      labelOr,
      enabled: def.locked ? true : (item as { enabled?: unknown })?.enabled !== false,
      required: def.requiredFixed ? true : (item as { required?: unknown })?.required === true,
    });
  }
  // Every registry field must be present — append any the admin list missed so
  // a stale config can never drop a locked field.
  for (const def of INDUSTRY_SURVEY_FIELDS) {
    if (!seen.has(def.key)) {
      out.push({
        key: def.key,
        labelEn: def.labelEn,
        labelOr: def.labelOr,
        enabled: true,
        required: def.required,
      });
    }
  }
  return out.length > 0 ? out : null;
}

/**
 * Merges a saved config with the registry — the read-side equivalent of
 * normalizeSurveyFields for configs persisted earlier. Falls back to the
 * defaults when nothing valid was saved.
 */
export function mergeSurveyFields(saved: unknown): IndustrySurveyFieldConfig[] {
  return normalizeSurveyFields(saved) ?? SURVEY_FIELDS_DEFAULT.map((f) => ({ ...f }));
}

/** Ordered fields of one wizard step (saved order within the step). */
export function surveyFieldsForStep(
  fields: IndustrySurveyFieldConfig[],
  step: 1 | 2 | 3
): IndustrySurveyFieldConfig[] {
  return fields.filter((f) => industrySurveyFieldDef(f.key)?.step === step && f.enabled);
}

/** Whether a field is currently shown on the form. */
export function surveyFieldEnabled(
  fields: IndustrySurveyFieldConfig[],
  key: string
): boolean {
  const cfg = fields.find((f) => f.key === key);
  if (!cfg) return industrySurveyFieldDef(key)?.locked ?? false;
  return cfg.enabled;
}

/** Whether a shown field must be filled before submission. */
export function surveyFieldRequired(
  fields: IndustrySurveyFieldConfig[],
  key: string
): boolean {
  const cfg = fields.find((f) => f.key === key);
  const def = industrySurveyFieldDef(key);
  if (!cfg) return def?.required ?? false;
  return def?.requiredFixed ? true : cfg.required;
}
