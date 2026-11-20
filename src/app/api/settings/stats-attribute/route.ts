import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// Key in the AppSetting table that stores the Sector Distribution attribution
const STATS_ATTRIBUTE_KEY = 'statsSectorDistributionGroupBy';

const VALID_ATTRIBUTES = ['category', 'woreda', 'employees'] as const;

/**
 * GET /api/settings/stats-attribute
 * Returns the attribute the Sector Distribution stats group by.
 * Any logged-in user can read it (the stats page needs it).
 */
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const setting = await db.appSetting.findUnique({ where: { key: STATS_ATTRIBUTE_KEY } });
    const attribute =
      setting && (VALID_ATTRIBUTES as readonly string[]).includes(setting.value)
        ? setting.value
        : 'category';

    return NextResponse.json({ attribute });
  } catch (error) {
    console.error('Error fetching stats attribute:', error);
    return NextResponse.json({ error: 'Failed to fetch stats attribute' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/stats-attribute
 * Admin only — saves which attribute the Sector Distribution stats group by.
 * Body: { attribute: 'category' | 'woreda' | 'employees' }
 */
export async function PUT(request: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const attribute = String(body?.attribute || '');
    if (!(VALID_ATTRIBUTES as readonly string[]).includes(attribute)) {
      return NextResponse.json(
        { error: 'attribute must be one of: category, woreda, employees' },
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
