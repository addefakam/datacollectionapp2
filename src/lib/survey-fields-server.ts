import { db } from '@/lib/db';
import {
  SURVEY_SECTORS,
  mergeSectorSurveyFields,
  normalizeSectorSurveyFields,
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
