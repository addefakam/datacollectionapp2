import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// Annual budget ranges (ETB) used for the budget distribution grouping.
// max: null means open-ended (e.g. "1M+").
const BUDGET_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: 'No budget recorded', min: -1, max: 0 },
  { label: '1 – 50K', min: 1, max: 50000 },
  { label: '50K – 200K', min: 50001, max: 200000 },
  { label: '200K – 500K', min: 200001, max: 500000 },
  { label: '500K – 1M', min: 500001, max: 1000000 },
  { label: '1M+', min: 1000001, max: null },
];

// GET /api/charities/stats — aggregate statistics for the Bussa Goonofa (Charity) dashboard
export async function GET() {
  try {
    const [total, beneficiaryAgg, volunteerAgg, budgetAgg, registered, withRegNumber, subCityStats, typeRows, orgRows] =
      await Promise.all([
        db.charityInitiative.count(),
        db.charityInitiative.aggregate({ _sum: { beneficiaryCount: true, maleBeneficiaries: true, femaleBeneficiaries: true } }),
        db.charityInitiative.aggregate({ _sum: { volunteerCount: true } }),
        db.charityInitiative.aggregate({ _sum: { annualBudget: true }, _avg: { annualBudget: true } }),
        db.charityInitiative.count({ where: { hasLegalRegistration: true } }),
        db.charityInitiative.count({ where: { registrationNumber: { not: null } } }),
        db.charityInitiative.groupBy({
          by: ['subCity'],
          _count: true,
          _sum: { beneficiaryCount: true },
          orderBy: { subCity: 'asc' },
        }),
        // charityType + beneficiaryCount per record — split in memory so a
        // record with several types ("A, B") counts toward every listed type
        db.charityInitiative.findMany({ select: { charityType: true, beneficiaryCount: true, volunteerCount: true, annualBudget: true } }),
        db.charityInitiative.groupBy({
          by: ['organizationType'],
          _count: true,
          orderBy: { organizationType: 'asc' },
        }),
      ]);

    // Per-type aggregation (tolerates comma-separated multi-values)
    const typeMap: Record<string, { count: number; beneficiaries: number }> = {};
    for (const row of typeRows) {
      const parts = (row.charityType || 'Unspecified')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const t of parts) {
        const bucket = (typeMap[t] ??= { count: 0, beneficiaries: 0 });
        bucket.count += 1;
        bucket.beneficiaries += row.beneficiaryCount;
      }
    }
    const typeStats = Object.entries(typeMap)
      .map(([charityType, v]) => ({ charityType, count: v.count, beneficiaries: v.beneficiaries }))
      .sort((a, b) => b.count - a.count);

    // Budget distribution buckets
    const budgetBuckets = BUDGET_BUCKETS.map((b) => ({
      label: b.label,
      count: typeRows.filter((r) => {
        const c = r.annualBudget ?? 0;
        if (b.min === -1) return (r.annualBudget == null || c <= 0) && true;
        return c >= b.min && (b.max === null || c <= b.max);
      }).length,
    }));

    const totalBudget = budgetAgg._sum.annualBudget || 0;
    const avgBudget = budgetAgg._avg.annualBudget ? Math.round(budgetAgg._avg.annualBudget) : 0;

    return NextResponse.json({
      total,
      registered,
      withRegNumber,
      totalBeneficiaries: beneficiaryAgg._sum.beneficiaryCount || 0,
      maleBeneficiaries: beneficiaryAgg._sum.maleBeneficiaries || 0,
      femaleBeneficiaries: beneficiaryAgg._sum.femaleBeneficiaries || 0,
      totalVolunteers: volunteerAgg._sum.volunteerCount || 0,
      totalBudget,
      avgBudget,
      types: typeStats,
      organizationTypes: orgRows.map((o) => ({ organizationType: o.organizationType, count: o._count })),
      subCities: subCityStats
        .map((s) => ({ subCity: s.subCity, count: s._count, beneficiaries: s._sum.beneficiaryCount || 0 }))
        .sort((a, b) => b.count - a.count),
      budgetBuckets: budgetBuckets.filter((b) => b.count > 0 || b.label === 'No budget recorded'),
    });
  } catch (error) {
    console.error('Error fetching charity stats:', error);
    return NextResponse.json({ error: 'Failed to fetch charity stats' }, { status: 500 });
  }
}
