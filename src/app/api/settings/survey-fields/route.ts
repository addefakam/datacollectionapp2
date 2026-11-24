import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/api-auth';
import {
  SURVEY_FIELDS_DEFAULT,
  normalizeSurveyFields,
} from '@/lib/industry-survey-fields';
import {
  SURVEY_FIELDS_SETTING_KEY,
  loadSurveyFields,
  saveSurveyFields,
} from '@/lib/industry-survey-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/survey-fields
 * Returns the admin-managed Industry survey questionnaire. Any logged-in user
 * can read it (the survey form needs it); only admins can change it.
 */
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const fields = await loadSurveyFields();
    return NextResponse.json({ fields });
  } catch (error) {
    console.error('Error fetching survey fields:', error);
    return NextResponse.json({ error: 'Failed to fetch survey fields' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/survey-fields
 * Admin only — saves the whole questionnaire (order within steps, shown /
 * required flags, bilingual labels). Body: { fields: [{ key, labelEn, labelOr,
 * enabled, required }] }. Locked fields are always forced back on.
 */
export async function PUT(request: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const fields = normalizeSurveyFields(body?.fields);
    if (!fields) {
      return NextResponse.json(
        {
          error:
            'fields must be a non-empty list of valid question keys — locked questions (establishmentName, sector, subCity, area, employeeCount, contactName, contactPhone) cannot be removed',
        },
        { status: 400 }
      );
    }

    await saveSurveyFields(fields);

    // Sanity check: the setting round-trips (guards against a broken DB write).
    const saved = await db.appSetting.findUnique({ where: { key: SURVEY_FIELDS_SETTING_KEY } });
    if (!saved?.value) {
      return NextResponse.json({ error: 'Failed to persist survey fields' }, { status: 500 });
    }

    return NextResponse.json({ fields });
  } catch (error) {
    console.error('Error saving survey fields:', error);
    return NextResponse.json({ error: 'Failed to save survey fields' }, { status: 500 });
  }
}

/**
 * DELETE /api/settings/survey-fields
 * Admin only — resets the questionnaire to the registry defaults.
 */
export async function DELETE() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    await db.appSetting.deleteMany({ where: { key: SURVEY_FIELDS_SETTING_KEY } });
    return NextResponse.json({ fields: SURVEY_FIELDS_DEFAULT });
  } catch (error) {
    console.error('Error resetting survey fields:', error);
    return NextResponse.json({ error: 'Failed to reset survey fields' }, { status: 500 });
  }
}
