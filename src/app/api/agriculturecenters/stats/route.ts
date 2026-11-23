import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// Land size buckets (hectares) used by the "Land Ranges" grouping.
// max: null means open-ended (e.g. "50+ ha"). `zero` marks the exact-zero bucket.
const LAND_BUCKETS: { label: string; min: number; max: number | null; zero?: boolean }[] = [
  { label: '0 (none)', min: 0, max: 0, zero: true },
  { label: '≤1 ha', min: 0, max: 1 },
  { label: '1–2 ha', min: 1, max: 2 },
  { label: '2–5 ha', min: 2, max: 5 },
  { label: '5–10 ha', min: 5, max: 10 },
  { label: '10–50 ha', min: 10, max: 50 },
  { label: '50+ ha', min: 50, max: null },
];

// GET /api/agriculturecenters/stats — aggregate statistics for the agriculture dashboard
export async function GET() {
  try {
    const [total, workersAgg, landAgg, typeStats, subCityStats, woredaStats, withLicense, landRows] =
      await Promise.all([
        db.agricultureCenter.count(),
        db.agricultureCenter.aggregate({ _sum: { workerCount: true, maleWorkers: true, femaleWorkers: true } }),
        db.agricultureCenter.aggregate({ _sum: { landSizeHectares: true } }),
        db.agricultureCenter.groupBy({
          by: ['farmType'],
          _count: true,
          _sum: { workerCount: true },
          orderBy: { farmType: 'asc' },
        }),
        db.agricultureCenter.groupBy({
          by: ['subCity'],
          _count: true,
          _sum: { workerCount: true },
          orderBy: { subCity: 'asc' },
        }),
        db.agricultureCenter.groupBy({
          by: ['subCity', 'area'],
          _count: true,
          _sum: { workerCount: true },
          orderBy: { subCity: 'asc' },
        }),
        db.agricultureCenter.count({ where: { licenseNumber: { not: null } } }),
        // Only fetch land sizes + worker counts (small payload) to bucket in memory
        db.agricultureCenter.findMany({ select: { landSizeHectares: true, workerCount: true } }),
      ]);

    // Land-size buckets (count of establishments + workers per range, Float-safe)
    const landRanges = LAND_BUCKETS.map((b) => {
      const rows = landRows.filter(
        (r) =>
          b.zero
            ? r.landSizeHectares === 0
            : r.landSizeHectares > b.min && (b.max === null || r.landSizeHectares <= b.max)
      );
      return {
        label: b.label,
        min: b.min,
        max: b.max,
        count: rows.length,
        workers: rows.reduce((sum, r) => sum + r.workerCount, 0),
      };
    }).filter((r) => r.count > 0 || r.min === 0);

    // Merge woreda counts into sub-city structure
    const woredaBySubCity: Record<string, { area: string; count: number; workers: number }[]> = {};
    for (const w of woredaStats) {
      if (!woredaBySubCity[w.subCity]) woredaBySubCity[w.subCity] = [];
      woredaBySubCity[w.subCity].push({
        area: w.area,
        count: w._count,
        workers: w._sum.workerCount || 0,
      });
    }

    // Uniform chart buckets per groupable attribute.
    // Each bucket carries the /api/agriculturecenters filter for its click-through dialog.
    const attributeBuckets: Record<
      string,
      { label: string; subLabel?: string; count: number; workers: number; filter: Record<string, string> }[]
    > = {
      farmType: typeStats.map((t) => ({
        label: t.farmType,
        count: t._count,
        workers: t._sum.workerCount || 0,
        filter: { farmType: t.farmType },
      })),
      subCity: subCityStats.map((s) => ({
        label: s.subCity,
        count: s._count,
        workers: s._sum.workerCount || 0,
        filter: { subCity: s.subCity },
      })),
      woreda: woredaStats.map((w) => ({
        label: w.area,
        subLabel: w.subCity,
        count: w._count,
        workers: w._sum.workerCount || 0,
        filter: { subCity: w.subCity, area: w.area },
      })),
      land: landRanges.map((r) => {
        const filter: Record<string, string> =
          r.max === null
            ? { minLand: String(r.min) }
            : { minLand: String(r.min), maxLand: String(r.max) };
        return {
          label: r.label,
          count: r.count,
          workers: r.workers,
          filter,
        };
      }),
    };

    return NextResponse.json({
      total,
      totalWorkers: workersAgg._sum.workerCount || 0,
      totalMaleWorkers: workersAgg._sum.maleWorkers || 0,
      totalFemaleWorkers: workersAgg._sum.femaleWorkers || 0,
      totalLand: landAgg._sum.landSizeHectares || 0,
      withLicense,
      types: typeStats.map((t) => ({
        farmType: t.farmType,
        count: t._count,
        workers: t._sum.workerCount || 0,
      })),
      woredas: woredaStats
        .map((w) => ({
          subCity: w.subCity,
          area: w.area,
          count: w._count,
          workers: w._sum.workerCount || 0,
        }))
        .sort((a, b) => b.count - a.count),
      landRanges,
      subCities: subCityStats.map((s) => ({
        subCity: s.subCity,
        count: s._count,
        workers: s._sum.workerCount || 0,
        woredas: (woredaBySubCity[s.subCity] || []).sort((a, b) => b.count - a.count),
      })),
      attributeBuckets,
    });
  } catch (error) {
    console.error('Error fetching agriculture center stats:', error);
    return NextResponse.json({ error: 'Failed to fetch agriculture center stats' }, { status: 500 });
  }
}
