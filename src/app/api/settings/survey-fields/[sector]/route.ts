import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/api-auth';
import {
  SURVEY_SECTORS,
  isSurveySectorId,
  normalizeSectorSurveyFields,
  sectorSurveyFieldsDefault,
  type SurveySectorId,
} from '@/lib/survey-fields';
import { loadSectorSurveyFields, saveSectorSurveyFields } from '@/lib/survey-fields-server';

export const dynamic = 'force-dynamic';

async function sectorParam(params: Promise<{ sector: string }>): Promise<SurveySectorId | null> {
  const { sector } = await params;
  return isSurveySectorId(sector) ? sector : null;
}

/**
 * GET /api/settings/survey-fields/[sector]
 * Returns the admin-managed survey questionnaire of a module (guesthouse,
 * health, education, agriculture, small-enterprise). Any logged-in user can
 * read it (the survey form needs it); only admins can change it. The Industry
 * module keeps its own endpoint at /api/settings/survey-fields.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sector: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const sector = await sectorParam(params);
    if (!sector) {
      return NextResponse.json({ error: 'Unknown survey sector' }, { status: 404 });
    }

    const fields = await loadSectorSurveyFields(sector);
    return NextResponse.json({ sector, fields });
  } catch (error) {
    console.error('Error fetching survey fields:', error);
    return NextResponse.json({ error: 'Failed to fetch survey fields' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/survey-fields/[sector]
 * Admin only — saves the whole questionnaire (order within steps, shown /
 * required flags, bilingual labels). Body: { fields: [{ key, labelEn, labelOr,
 * enabled, required }] }. Locked fields are always forced back on.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sector: string }> }
) {
  try {
    const sector = await sectorParam(params);
    if (!sector) {
      return NextResponse.json({ error: 'Unknown survey sector' }, { status: 404 });
    }

    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const fields = normalizeSectorSurveyFields(sector, body?.fields);
    if (!fields) {
      const lockedKeys = SURVEY_SECTORS[sector].fields
        .filter((f) => f.locked)
        .map((f) => f.key)
        .join(', ');
      return NextResponse.json(
        {
          error: `fields must be a non-empty list of valid question keys — locked questions (${lockedKeys}) cannot be removed`,
        },
        { status: 400 }
      );
    }

    await saveSectorSurveyFields(sector, fields);

    // Sanity check: the setting round-trips (guards against a broken DB write).
    const saved = await db.appSetting.findUnique({
      where: { key: SURVEY_SECTORS[sector].settingKey },
    });
    if (!saved?.value) {
      return NextResponse.json({ error: 'Failed to persist survey fields' }, { status: 500 });
    }

    return NextResponse.json({ sector, fields });
  } catch (error) {
    console.error('Error saving survey fields:', error);
    return NextResponse.json({ error: 'Failed to save survey fields' }, { status: 500 });
  }
}

/**
 * DELETE /api/settings/survey-fields/[sector]
 * Admin only — resets the questionnaire to the registry defaults.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sector: string }> }
) {
  try {
    const sector = await sectorParam(params);
    if (!sector) {
      return NextResponse.json({ error: 'Unknown survey sector' }, { status: 404 });
    }

    const { error } = await requireAdmin();
    if (error) return error;

    await db.appSetting.deleteMany({ where: { key: SURVEY_SECTORS[sector].settingKey } });
    return NextResponse.json({ sector, fields: sectorSurveyFieldsDefault(sector) });
  } catch (error) {
    console.error('Error resetting survey fields:', error);
    return NextResponse.json({ error: 'Failed to reset survey fields' }, { status: 500 });
  }
}
