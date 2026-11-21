import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// Staff size buckets used by the "Number of Staff" grouping.
// max: null means open-ended (e.g. "100+").
const STAFF_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: '0 (none)', min: 0, max: 0 },
  { label: '1–5', min: 1, max: 5 },
  { label: '6–10', min: 6, max: 10 },
  { label: '11–25', min: 11, max: 25 },
  { label: '26–50', min: 26, max: 50 },
  { label: '51–100', min: 51, max: 100 },
  { label: '100+', min: 101, max: null },
];

// GET /api/healthcenters/stats — aggregate statistics for the health dashboard
export async function GET() {
  try {
    const [total, staffAgg, bedAgg, typeStats, subCityStats, woredaStats, withLicense, staffCounts] =
      await Promise.all([
        db.healthCenter.count(),
        db.healthCenter.aggregate({ _sum: { staffCount: true } }),
        db.healthCenter.aggregate({ _sum: { bedCount: true } }),
        db.healthCenter.groupBy({
          by: ['facilityType'],
          _count: true,
          _sum: { staffCount: true },
          orderBy: { facilityType: 'asc' },
        }),
        db.healthCenter.groupBy({
          by: ['subCity'],
          _count: true,
          _sum: { staffCount: true },
          orderBy: { subCity: 'asc' },
        }),
        db.healthCenter.groupBy({
          by: ['subCity', 'area'],
          _count: true,
          _sum: { staffCount: true },
          orderBy: { subCity: 'asc' },
        }),
        db.healthCenter.count({ where: { licenseNumber: { not: null } } }),
        // Only fetch staff counts (small payload) to bucket in memory
        db.healthCenter.findMany({ select: { staffCount: true } }),
      ]);

    // Staff-size buckets (count of facilities + staff per range)
    const staffRanges = STAFF_BUCKETS.map((b) => {
      const rows = staffCounts.filter(
        (r) => r.staffCount >= b.min && (b.max === null || r.staffCount <= b.max)
      );
      return {
        label: b.label,
        min: b.min,
        max: b.max,
        count: rows.length,
        staff: rows.length,
      };
    }).filter((r) => r.count > 0 || r.min === 0);

    // Merge woreda counts into sub-city structure
    const woredaBySubCity: Record<string, { area: string; count: number; staff: number }[]> = {};
    for (const w of woredaStats) {
      if (!woredaBySubCity[w.subCity]) woredaBySubCity[w.subCity] = [];
      woredaBySubCity[w.subCity].push({
        area: w.area,
        count: w._count,
        staff: w._sum.staffCount || 0,
      });
    }

    // Uniform chart buckets per groupable attribute.
    // Each bucket carries the /api/healthcenters filter for its click-through dialog.
    const attributeBuckets: Record<
      string,
      { label: string; subLabel?: string; count: number; staff: number; filter: Record<string, string> }[]
    > = {
      facilityType: typeStats.map((t) => ({
        label: t.facilityType,
        count: t._count,
        staff: t._sum.staffCount || 0,
        filter: { facilityType: t.facilityType },
      })),
      subCity: subCityStats.map((s) => ({
        label: s.subCity,
        count: s._count,
        staff: s._sum.staffCount || 0,
        filter: { subCity: s.subCity },
      })),
      woreda: woredaStats.map((w) => ({
        label: w.area,
        subLabel: w.subCity,
        count: w._count,
        staff: w._sum.staffCount || 0,
        filter: { subCity: w.subCity, area: w.area },
      })),
      staff: staffRanges.map((r) => ({
        label: r.label,
        count: r.count,
        staff: r.staff,
        filter:
          r.max === null
            ? { minStaff: String(r.min) }
            : { minStaff: String(r.min), maxStaff: String(r.max) },
      })),
    };

    return NextResponse.json({
      total,
      totalStaff: staffAgg._sum.staffCount || 0,
      totalBeds: bedAgg._sum.bedCount || 0,
      withLicense,
      types: typeStats.map((t) => ({
        facilityType: t.facilityType,
        count: t._count,
        staff: t._sum.staffCount || 0,
      })),
      woredas: woredaStats
        .map((w) => ({
          subCity: w.subCity,
          area: w.area,
          count: w._count,
          staff: w._sum.staffCount || 0,
        }))
        .sort((a, b) => b.count - a.count),
      staffRanges,
      subCities: subCityStats.map((s) => ({
        subCity: s.subCity,
        count: s._count,
        staff: s._sum.staffCount || 0,
        woredas: (woredaBySubCity[s.subCity] || []).sort((a, b) => b.count - a.count),
      })),
      attributeBuckets,
    });
  } catch (error) {
    console.error('Error fetching health center stats:', error);
    return NextResponse.json({ error: 'Failed to fetch health center stats' }, { status: 500 });
  }
}
