import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

// GET /api/industry-attendance/summary?meetingId=xxx
// Returns industry attendance summary grouped by subCity and area
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as Record<string, unknown> | undefined;

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get('meetingId');

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required' }, { status: 400 });
    }

    const records = await db.industryAttendance.findMany({
      where: { meetingId },
      include: {
        industry: {
          select: {
            subCity: true,
            area: true,
            establishmentName: true,
          },
        },
      },
    });

    // Group by subCity then area
    const summary: Record<string, {
      total: number;
      present: number;
      areas: Record<string, { total: number; present: number }>;
    }> = {};

    for (const rec of records) {
      const sc = rec.industry.subCity;
      const ar = rec.industry.area;

      if (!summary[sc]) {
        summary[sc] = { total: 0, present: 0, areas: {} };
      }
      if (!summary[sc].areas[ar]) {
        summary[sc].areas[ar] = { total: 0, present: 0 };
      }

      summary[sc].total++;
      summary[sc].areas[ar].total++;

      if (rec.status === 'PRESENT') {
        summary[sc].present++;
        summary[sc].areas[ar].present++;
      }
    }

    const totalIndustries = await db.industry.count();
    const totalMarked = records.length;

    return NextResponse.json({
      meetingId,
      totalIndustries,
      totalMarked,
      totalPresent: records.filter((r) => r.status === 'PRESENT').length,
      totalAbsent: records.filter((r) => r.status === 'ABSENT').length,
      summary,
    });
  } catch (error) {
    console.error('Error fetching industry attendance summary:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
