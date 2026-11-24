import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';

/**
 * Remove a wrong donation entry (admin) — e.g. a mistyped amount.
 * The entry must belong to the campaign in the URL.
 */

// DELETE /api/donation-campaigns/[id]/donations/[entryId]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const { id, entryId } = await params;

    const entry = await db.donationEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.campaignId !== id) {
      return NextResponse.json({ error: 'Entry not found for this campaign' }, { status: 404 });
    }

    await db.donationEntry.delete({ where: { id: entryId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting donation entry:', error);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }
}
