import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// Capital ranges used for the "Start-up Capital" grouping.
// max: null means open-ended (e.g. "500K+").
const CAPITAL_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: 'No capital recorded', min: -1, max: 0 },
  { label: '1 – 25K', min: 1, max: 25000 },
  { label: '25K – 100K', min: 25001, max: 100000 },
  { label: '100K – 500K', min: 100001, max: 500000 },
  { label: '500K – 1M', min: 500001, max: 1000000 },
  { label: '1M+', min: 1000001, max: null },
];

// GET /api/smallenterprises/stats — aggregate statistics for the small-enterprise dashboard
export async function GET() {
  try {
    const [total, employeeAgg, capitalAgg, licensed, withPremises, withTraining, subCityStats, typeRows, ownershipRows] =
      await Promise.all([
        db.smallEnterprise.count(),
        db.smallEnterprise.aggregate({ _sum: { employeeCount: true, maleEmployees: true, femaleEmployees: true } }),
        db.smallEnterprise.aggregate({ _sum: { startupCapital: true }, _avg: { startupCapital: true } }),
        db.smallEnterprise.count({ where: { licenseNumber: { not: null } } }),
        db.smallEnterprise.count({ where: { hasPremises: true } }),
        db.smallEnterprise.count({ where: { hasTraining: true } }),
        db.smallEnterprise.groupBy({
          by: ['subCity'],
          _count: true,
          _sum: { employeeCount: true },
          orderBy: { subCity: 'asc' },
        }),
        // enterpriseType + employeeCount per record — split in memory so a
        // record with several types ("A, B") counts toward every listed type
        db.smallEnterprise.findMany({ select: { enterpriseType: true, employeeCount: true, startupCapital: true } }),
        db.smallEnterprise.groupBy({
          by: ['ownershipType'],
          _count: true,
          orderBy: { ownershipType: 'asc' },
        }),
      ]);

    // Per-type aggregation (tolerates comma-separated multi-values)
    const typeMap: Record<string, { count: number; employees: number }> = {};
    for (const row of typeRows) {
      const parts = (row.enterpriseType || 'Unspecified')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const t of parts) {
        const bucket = (typeMap[t] ??= { count: 0, employees: 0 });
        bucket.count += 1;
        bucket.employees += row.employeeCount;
      }
    }
    const typeStats = Object.entries(typeMap)
      .map(([enterpriseType, v]) => ({ enterpriseType, count: v.count, employees: v.employees }))
      .sort((a, b) => b.count - a.count);

    // Capital distribution buckets
    const capitalBuckets = CAPITAL_BUCKETS.map((b) => ({
      label: b.label,
      count: typeRows.filter((r) => {
        const c = r.startupCapital ?? 0;
        if (b.min === -1) return (r.startupCapital == null || c <= 0) && true;
        return c >= b.min && (b.max === null || c <= b.max);
      }).length,
    }));

    const totalCapital = capitalAgg._sum.startupCapital || 0;
    const avgCapital = capitalAgg._avg.startupCapital ? Math.round(capitalAgg._avg.startupCapital) : 0;

    return NextResponse.json({
      total,
      licensed,
      withPremises,
      withTraining,
      totalEmployees: employeeAgg._sum.employeeCount || 0,
      maleEmployees: employeeAgg._sum.maleEmployees || 0,
      femaleEmployees: employeeAgg._sum.femaleEmployees || 0,
      totalCapital,
      avgCapital,
      types: typeStats,
      ownerships: ownershipRows.map((o) => ({ ownershipType: o.ownershipType, count: o._count })),
      subCities: subCityStats
        .map((s) => ({ subCity: s.subCity, count: s._count, employees: s._sum.employeeCount || 0 }))
        .sort((a, b) => b.count - a.count),
      capitalBuckets: capitalBuckets.filter((b) => b.count > 0 || b.label === 'No capital recorded'),
    });
  } catch (error) {
    console.error('Error fetching small enterprise stats:', error);
    return NextResponse.json({ error: 'Failed to fetch small enterprise stats' }, { status: 500 });
  }
}
