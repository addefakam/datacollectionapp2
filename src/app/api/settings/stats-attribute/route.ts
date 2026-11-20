import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/api-auth';
import { STATS_ATTRIBUTES, isStatsAttributeKey } from '@/lib/stats-attributes';
import { STATS_ATTRIBUTE_KEY, loadAttributeOptions } from '@/lib/stats-attribute-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/stats-attribute
 * Returns the default attribute the Sector Distribution stats group by plus the
 * admin-managed options. Any logged-in user can read it (the stats page needs it).
 */
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [setting, options] = await Promise.all([
      db.appSetting.findUnique({ where: { key: STATS_ATTRIBUTE_KEY } }),
      loadAttributeOptions(),
    ]);

    // Saved default must be a valid key AND still enabled — otherwise use the
    // first enabled option so the chart can never break.
    let attribute =
      setting && isStatsAttributeKey(setting.value) ? setting.value : STATS_ATTRIBUTES[0].key;
    if (!options.some((o) => o.key === attribute)) {
      attribute = options[0].key;
    }

    return NextResponse.json({ attribute, options });
  } catch (error) {
    console.error('Error fetching stats attribute:', error);
    return NextResponse.json({ error: 'Failed to fetch stats attribute' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/stats-attribute
 * Admin only — saves which attribute the Sector Distribution stats group by.
 * Body: { attribute: <registry key> }
 */
export async function PUT(request: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const attribute = String(body?.attribute || '');
    if (!isStatsAttributeKey(attribute)) {
      return NextResponse.json(
        {
          error: `attribute must be one of: ${STATS_ATTRIBUTES.map((a) => a.key).join(', ')}`,
        },
        { status: 400 }
      );
    }

    await db.appSetting.upsert({
      where: { key: STATS_ATTRIBUTE_KEY },
      update: { value: attribute },
      create: { key: STATS_ATTRIBUTE_KEY, value: attribute },
    });

    return NextResponse.json({ attribute });
  } catch (error) {
    console.error('Error saving stats attribute:', error);
    return NextResponse.json({ error: 'Failed to save stats attribute' }, { status: 500 });
  }
}
