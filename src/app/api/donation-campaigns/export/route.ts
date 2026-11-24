import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { analyzeCampaign, type AssignmentDTO, type DonationDTO } from '@/lib/donation-campaign';

function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/donation-campaigns/export?campaignId= — office-wise goal report as
// CSV: one row per responsible office (minimum vs collected, attainment, gap,
// pace, status) plus the campaign total. Presented to higher officials.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');
    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId query parameter is required' }, { status: 400 });
    }

    const campaign = await db.donationCampaign.findUnique({
      where: { id: campaignId },
      include: {
        assignments: {
          orderBy: { createdAt: 'asc' },
          include: { department: { select: { name: true } } },
        },
        donations: { orderBy: { reportDate: 'asc' }, include: { department: { select: { name: true } } } },
      },
    });
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const assignments: AssignmentDTO[] = campaign.assignments.map((a) => ({
      id: a.id,
      campaignId: a.campaignId,
      departmentId: a.departmentId,
      departmentName: a.department.name,
      minimumAmount: a.minimumAmount,
      note: a.note,
    }));
    const donations: DonationDTO[] = campaign.donations.map((d) => ({
      id: d.id,
      campaignId: d.campaignId,
      departmentId: d.departmentId,
      departmentName: d.department.name,
      reportDate: d.reportDate.toISOString(),
      cashAmount: d.cashAmount,
      inKindValue: d.inKindValue,
      inKindDetails: d.inKindDetails,
      donorsCount: d.donorsCount,
      notes: d.notes,
      reportedByName: d.reportedByName,
      createdAt: d.createdAt.toISOString(),
    }));
    const analysis = analyzeCampaign(campaign, assignments, donations);

    const round2 = (v: number) => Math.round(v * 100) / 100;
    const r1 = (v: number | null) => (v != null ? Math.round(v * 10) / 10 : '');

    const HEADERS = [
      'Office',
      'Minimum Amount',
      'Cash Collected',
      'In-Kind Value',
      'Total Collected',
      'Attainment %',
      'Gap to Minimum',
      'Expected By Now',
      'Pace Delta',
      'Status',
      'Entries',
      'Donors',
      'Last Report',
    ];

    const rows = analysis.offices.map((o) =>
      [
        o.departmentName,
        o.assigned ? round2(o.minimumAmount) : '',
        round2(o.cash),
        round2(o.inKind),
        round2(o.collected),
        r1(o.attainmentPct),
        round2(o.gap),
        round2(o.expectedByNow),
        o.paceDelta != null ? r1(o.paceDelta) : '',
        o.state,
        o.entries,
        o.donors,
        o.lastReportDate?.slice(0, 10) ?? '',
      ].map(csvCell).join(',')
    );

    rows.push(
      [
        'OFFICES WITH NO MINIMUM SET',
        '',
        round2(analysis.unassignedCollected),
        '',
        round2(analysis.unassignedCollected),
        '',
        '',
        '',
        '',
        'unassigned',
        '',
        '',
        '',
      ].map(csvCell).join(',')
    );
    rows.push(
      [
        'CAMPAIGN TOTAL',
        round2(assignments.reduce((s, a) => s + a.minimumAmount, 0)),
        round2(analysis.cash),
        round2(analysis.inKind),
        round2(analysis.collected),
        r1(analysis.attainmentPct),
        round2(analysis.gap),
        round2(analysis.expectedByNow),
        analysis.paceDelta != null ? r1(analysis.paceDelta) : '',
        analysis.state,
        analysis.entries,
        analysis.donors,
        '',
      ].map(csvCell).join(',')
    );

    const summary = [
      ['Campaign', campaign.name],
      ['Goal', round2(campaign.totalGoal)],
      ['Currency', campaign.currency],
      ['Window', `${campaign.startDate.toISOString().slice(0, 10)} to ${campaign.deadline.toISOString().slice(0, 10)}`],
      ['Status', campaign.status],
      ['Collected (cash + in-kind)', round2(analysis.collected)],
      ['Attainment %', r1(analysis.attainmentPct)],
      ['Gap', round2(analysis.gap)],
      ['Elapsed pace %', analysis.pacePct],
      ['Prepared', new Date().toISOString().slice(0, 10)],
      [''],
    ];

    const csv =
      '\uFEFF' +
      summary.map((r) => r.map(csvCell).join(',')).join('\n') +
      '\n' +
      HEADERS.join(',') +
      '\n' +
      rows.join('\n');

    const safeName = campaign.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'campaign';
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="goal-report-${safeName}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting campaign goal report:', error);
    return NextResponse.json({ error: 'Failed to export goal report' }, { status: 500 });
  }
}
