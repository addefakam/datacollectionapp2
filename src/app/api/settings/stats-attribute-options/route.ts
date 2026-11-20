import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAuthUser } from '@/lib/api-auth';
import { STATS_ATTRIBUTES, normalizeStatsAttributeOptions } from '@/lib/stats-attributes';
import { loadAttributeOptions, saveAttributeOptions } from '@/lib/stats-attribute-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/stats-attribute-options
 * Returns the admin-managed attribution options (any logged-in user).
 */
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ options: await loadAttributeOptions() });
  } catch (error) {
    console.error('Error fetching stats attribute options:', error);
    return NextResponse.json({ error: 'Failed to fetch options' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/stats-attribute-options
 * Admin only — replaces the managed attribution option list.
 * Body: { options: [{ key, label }] } — keys validated against the registry,
 * duplicates dropped, labels trimmed (default label when empty).
 */
export async function PUT(request: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const options = normalizeStatsAttributeOptions(body?.options);
    if (!options) {
      return NextResponse.json(
        {
          error: `options must be a non-empty list of valid keys: ${STATS_ATTRIBUTES.map((a) => a.key).join(', ')}`,
        },
        { status: 400 }
      );
    }

    await saveAttributeOptions(options);
    return NextResponse.json({ options });
  } catch (error) {
    console.error('Error saving stats attribute options:', error);
    return NextResponse.json({ error: 'Failed to save options' }, { status: 500 });
  }
}
