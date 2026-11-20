import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

// GET /api/industry-attendance?meetingId=xxx
// Returns industry attendance records for a meeting, optionally filtered by subCity/area
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as Record<string, unknown> | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get('meetingId');
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required' }, { status: 400 });
    }

    const records = await db.industryAttendance.findMany({
      where: { meetingId },
      include: {
        industry: {
          select: {
            id: true,
            establishmentName: true,
            subCity: true,
            area: true,
            sector: true,
            employeeCount: true,
            contactName: true,
          },
        },
        collector: {
          select: { id: true, name: true },
        },
      },
      orderBy: { industry: { subCity: 'asc' } },
    });

    // If subCity/area filter, only return matching
    const filtered = subCity || area
      ? records.filter((r) => {
          if (subCity && r.industry.subCity !== subCity) return false;
          if (area && r.industry.area !== area) return false;
          return true;
        })
      : records;

    return NextResponse.json({ records: filtered });
  } catch (error) {
    console.error('Error fetching industry attendance:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST /api/industry-attendance — mark attendance for an industry in a meeting
// Body: { meetingId, industryId, status: "PRESENT"|"ABSENT" }
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as Record<string, unknown> | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { meetingId, industryId, status } = await request.json();

    if (!meetingId || !industryId || !status) {
      return NextResponse.json({ error: 'meetingId, industryId, and status are required' }, { status: 400 });
    }

    if (status !== 'PRESENT' && status !== 'ABSENT') {
      return NextResponse.json({ error: 'Status must be PRESENT or ABSENT' }, { status: 400 });
    }

    // Upsert: create or update attendance for this industry in this meeting
    const attendance = await db.industryAttendance.upsert({
      where: {
        meetingId_industryId: { meetingId, industryId },
      },
      update: {
        status,
        collectorId: user.id as string,
      },
      create: {
        meetingId,
        industryId,
        collectorId: user.id as string,
        status,
      },
    });

    return NextResponse.json(attendance);
  } catch (error) {
    console.error('Error marking industry attendance:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
