import { db } from '@/lib/db';
import {
  SURVEY_FIELDS_SETTING_KEY,
  SURVEY_FIELDS_DEFAULT,
  mergeSurveyFields,
  normalizeSurveyFields,
} from '@/lib/industry-survey-fields';

/**
 * Server-side reader/writer for the admin-managed Industry survey
 * questionnaire (Settings → Survey, AppSetting "industrySurveyFields").
 * Used by the questionnaire editor API and by POST /api/industries so the
 * server-side required-field validation always matches the questionnaire.
 */

export { SURVEY_FIELDS_SETTING_KEY };

/** Reads the questionnaire, falling back to the registry defaults. */
export async function loadSurveyFields() {
  try {
    const setting = await db.appSetting.findUnique({ where: { key: SURVEY_FIELDS_SETTING_KEY } });
    if (setting?.value) {
      try {
        return mergeSurveyFields(JSON.parse(setting.value));
      } catch {
        // corrupted JSON — fall through to defaults
      }
    }
  } catch {
    // DB unavailable (offline test run etc.) — fall through to defaults
  }
  return SURVEY_FIELDS_DEFAULT.map((f) => ({ ...f }));
}

/** Persists the admin-managed questionnaire (already validated/normalized). */
export async function saveSurveyFields(
  fields: { key: string; labelEn: string; labelOr: string; enabled: boolean; required: boolean }[]
): Promise<void> {
  await db.appSetting.upsert({
    where: { key: SURVEY_FIELDS_SETTING_KEY },
    update: { value: JSON.stringify(fields) },
    create: { key: SURVEY_FIELDS_SETTING_KEY, value: JSON.stringify(fields) },
  });
}

export { normalizeSurveyFields };
