import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { isSmeStatus, SME_STATUSES, type SmeStatus } from '@/lib/sme';

export const dynamic = 'force-dynamic';

// POST /api/smallenterprises/bulk-status
//
// Bulk establishment-status modification for the SME record table. Given a
// list of record ids, either set one explicit status on all of them
// (`status`) or auto-advance every record one stage along the lifecycle
// REGISTERED → FULLY_LEGALIZED → AWAITING_OPERATION → OPERATIONAL
// (`advance: true`, stopping at OPERATIONAL). Every changed record gets its
// `statusUpdatedAt` stamp auto-populated and, when provided, a shared
// `statusNote`.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ids: unknown = body.ids;
    const note = body.note ? String(body.note).trim() : '';
    const advance = body.advance === true;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Provide the ids of the records to update' }, { status: 400 });
    }
    if (ids.length > 500) {
      return NextResponse.json({ error: 'Update at most 500 records at a time' }, { status: 400 });
    }
    if (!advance && !isSmeStatus(body.status)) {
      return NextResponse.json(
        { error: 'Invalid status. Use REGISTERED, FULLY_LEGALIZED, AWAITING_OPERATION or OPERATIONAL' },
        { status: 400 }
      );
    }
    const cleanIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];

    const existing = await db.smallEnterprise.findMany({
      where: { id: { in: cleanIds } },
      select: { id: true, status: true },
    });

    /** Next lifecycle stage, stopping at OPERATIONAL. */
    const nextOf = (current: string): SmeStatus => {
      const idx = (SME_STATUSES as readonly string[]).indexOf(current);
      return SME_STATUSES[Math.min(idx + 1, SME_STATUSES.length - 1)];
    };

    let updated = 0;
    let unchanged = 0;
    await Promise.all(
      existing.map((rec) => {
        const next = advance ? nextOf(rec.status) : (body.status as SmeStatus);
        if (next === rec.status) {
          unchanged += 1;
          return Promise.resolve();
        }
        return db.smallEnterprise
          .update({
            where: { id: rec.id },
            data: {
              status: next,
              statusUpdatedAt: new Date(), // auto-populated: when the stage changed
              statusNote: note || null,
            },
          })
          .then(() => {
            updated += 1;
          });
      })
    );

    return NextResponse.json({ updated, unchanged, missing: cleanIds.length - existing.length });
  } catch (error) {
    console.error('Error bulk-updating small enterprise statuses:', error);
    return NextResponse.json(
      { error: 'Failed to update records', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
