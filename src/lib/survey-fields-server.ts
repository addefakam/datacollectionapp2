import { db } from '@/lib/db';
import {
  SURVEY_SECTORS,
  mergeSectorSurveyFields,
  normalizeSectorSurveyFields,
  sanitizeCustomAnswers,
  type SurveyFieldConfig,
  type SurveySectorId,
} from '@/lib/survey-fields';

/**
 * Server-side reader/writer for the admin-managed survey questionnaires of the
 * five non-Industry modules (Hotel & Guest House, Health, Education,
 * Agriculture, Small Enterprise). Each questionnaire lives in its own
 * AppSetting row ("<sectorId>SurveyFields") and is edited from the module's
 * "Manage" workspace or Administration → Settings → Survey. Used by the
 * questionnaire editor API and by the sector POST routes so the server-side
 * required-field validation always matches the questionnaire.
 */

/** Reads a sector's questionnaire, falling back to the registry defaults. */
export async function loadSectorSurveyFields(sector: SurveySectorId): Promise<SurveyFieldConfig[]> {
  try {
    const setting = await db.appSetting.findUnique({
      where: { key: SURVEY_SECTORS[sector].settingKey },
    });
    if (setting?.value) {
      try {
        return mergeSectorSurveyFields(sector, JSON.parse(setting.value));
      } catch {
        // corrupted JSON — fall through to defaults
      }
    }
  } catch {
    // DB unavailable (offline test run etc.) — fall through to defaults
  }
  return mergeSectorSurveyFields(sector, undefined);
}

/** Persists a sector's questionnaire (already validated/normalized). */
export async function saveSectorSurveyFields(
  sector: SurveySectorId,
  fields: SurveyFieldConfig[]
): Promise<void> {
  await db.appSetting.upsert({
    where: { key: SURVEY_SECTORS[sector].settingKey },
    update: { value: JSON.stringify(fields) },
    create: { key: SURVEY_SECTORS[sector].settingKey, value: JSON.stringify(fields) },
  });
}

export { normalizeSectorSurveyFields };

/**
 * Sanitizes the custom-question answers of an incoming record payload against
 * the sector's saved questionnaire and reports the required ones that are
 * missing (the POST routes answer 400 when any remain). Shared by every
 * module POST route — questionnaires are edited in Administration → Settings
 * → Survey / the module's Manage workspace.
 */
export function resolveCustomAnswers(
  surveyFields: SurveyFieldConfig[],
  raw: unknown
): { answers: Record<string, string>; missing: SurveyFieldConfig[] } {
  const answers = sanitizeCustomAnswers(surveyFields, raw);
  const missing = surveyFields.filter(
    (f: SurveyFieldConfig) => f.custom && f.enabled && f.required && !answers[f.key]
  );
  return { answers, missing };
}
