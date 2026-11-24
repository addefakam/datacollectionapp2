import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api-auth';
import {
  departmentPerformance,
  loadAnalyzedInitiatives,
  subCityPerformance,
} from '@/lib/initiative-queries';
import { summarizeGroup } from '@/lib/initiative-monitor';

// GET /api/initiatives/stats — the real-time performance analysis:
// overview, per-department accountability, per-sub-city breakdown, delays,
// status distribution, 14-day reporting trend and the latest daily reports.
export async function GET(_request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const all = await loadAnalyzedInitiatives({});

    const city = summarizeGroup('city', all.map((i) => ({ status: i.status, analysis: i.analysis })));

    const statusDistribution: Record<string, number> = {};
    for (const i of all) {
      statusDistribution[i.status] = (statusDistribution[i.status] ?? 0) + 1;
    }

    const delayed = all
      .filter((i) => i.analysis.delayed)
      .sort((a, b) => b.analysis.delayDays - a.analysis.delayDays)
      .slice(0, 50)
      .map((i) => ({
        id: i.id,
        name: i.name,
        departmentName: i.departmentName,
        subCity: i.subCity,
        status: i.status,
        expectedOperationalDate: i.expectedOperationalDate,
        delayDays: i.analysis.delayDays,
        attainmentPct: i.analysis.attainmentPct,
        daysSinceLastReport: i.analysis.daysSinceLastReport,
      }));

    const needsAttention = all
      .filter((i) => !i.analysis.fullyOperational && i.status !== 'CANCELLED')
      .filter((i) => i.analysis.reportDueToday || i.analysis.targets.some((t) => t.overdue))
      .sort((a, b) => (b.analysis.daysSinceLastReport ?? 99) - (a.analysis.daysSinceLastReport ?? 99))
      .slice(0, 50)
      .map((i) => ({
        id: i.id,
        name: i.name,
        departmentName: i.departmentName,
        status: i.status,
        daysSinceLastReport: i.analysis.daysSinceLastReport,
        overdueTargets: i.analysis.targets.filter((t) => t.overdue).length,
        attainmentPct: i.analysis.attainmentPct,
      }));

    // 14-day reporting trend (daily reports submitted per day)
    const trend: { date: string; reports: number; achieved: number }[] = [];
    const today = new Date();
    for (let d = 13; d >= 0; d--) {
      const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - d));
      const key = day.toISOString().slice(0, 10);
      const dayReports = all.flatMap((i) => i.reports).filter((r) => r.reportDate.slice(0, 10) === key);
      trend.push({
        date: key,
        reports: dayReports.length,
        achieved: dayReports.reduce((s, r) => s + (r.achievedValue ?? 0), 0),
      });
    }

    const recentReports = all
      .flatMap((i) =>
        i.reports.slice(0, 3).map((r) => ({
          id: r.id,
          initiativeId: i.id,
          initiativeName: i.name,
          departmentName: i.departmentName,
          reportDate: r.reportDate,
          activities: r.activities,
          achievedValue: r.achievedValue,
          reportedByName: r.reportedByName,
        }))
      )
      .sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1))
      .slice(0, 25);

    const targetVsActual = departmentPerformance(all).map((d) => ({
      department: d.group,
      target: Math.round(d.totalTarget * 100) / 100,
      actual: Math.round(d.achievedTotal * 100) / 100,
      gap: Math.round(d.gap * 100) / 100,
    }));

    return NextResponse.json({
      overview: {
        initiatives: city.initiatives,
        fullyOperational: city.fullyOperational,
        completionRatePct: city.completionRatePct,
        attainmentPct: city.attainmentPct,
        totalTarget: city.totalTarget,
        achievedTotal: city.achievedTotal,
        gap: city.gap,
        delayedCount: city.delayedCount,
        onTrackCount: city.onTrackCount,
        reportsLast7Days: city.reportsLast7Days,
        behindOnReports: city.behindOnReports,
        avgDaysSinceReport: city.avgDaysSinceReport,
      },
      departments: departmentPerformance(all),
      subCities: subCityPerformance(all),
      statusDistribution,
      delayed,
      needsAttention,
      trend,
      recentReports,
      targetVsActual,
    });
  } catch (error) {
    console.error('Error computing initiative stats:', error);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}
