import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api-auth';
import { loadAnalyzedInitiatives, type AnalyzedInitiative } from '@/lib/initiative-queries';

function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  'Initiative', 'Category', 'Responsible Department', 'Sub-City', 'Area', 'Location',
  'Status', 'Establishment Date', 'Expected Fully Operational', 'Operational Date',
  'Delay (days)', 'Targets', 'Target Total', 'Achieved', 'Attainment %', 'Gap',
  'Targets Met', 'Last Report', 'Days Since Last Report', 'Reports (last 7 days)', 'Registered By',
];

// GET /api/initiatives/export — CSV of all initiatives with the live analysis
export async function GET(_request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const all = await loadAnalyzedInitiatives({});
    const rows = all.map((i: AnalyzedInitiative) =>
      [
        i.name, i.category, i.departmentName, i.subCity, i.area ?? '', i.location ?? '',
        i.status, i.establishmentDate?.slice(0, 10) ?? '', i.expectedOperationalDate?.slice(0, 10) ?? '',
        i.operationalDate?.slice(0, 10) ?? '', i.analysis.delayDays || '',
        i.analysis.activeTargets, i.analysis.totalTarget,
        Math.round(i.analysis.achievedTotal * 100) / 100,
        i.analysis.attainmentPct != null ? Math.round(i.analysis.attainmentPct * 10) / 10 : '',
        Math.max(0, i.analysis.totalTarget - i.analysis.achievedTotal),
        `${i.analysis.metTargets}/${i.analysis.activeTargets}`,
        i.analysis.lastReportDate?.slice(0, 10) ?? '', i.analysis.daysSinceLastReport ?? '',
        i.analysis.reportsLast7Days, i.surveyorName ?? '',
      ].map(csvCell).join(',')
    );

    const csv = '\uFEFF' + HEADERS.join(',') + '\n' + rows.join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="initiatives-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting initiatives:', error);
    return NextResponse.json({ error: 'Failed to export initiatives' }, { status: 500 });
  }
}
