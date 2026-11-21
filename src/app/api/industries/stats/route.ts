import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// Employee size buckets used by the "Number of Employees" grouping.
// max: null means open-ended (e.g. "100+").
const EMPLOYEE_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: '0 (none)', min: 0, max: 0 },
  { label: '1–5', min: 1, max: 5 },
  { label: '6–10', min: 6, max: 10 },
  { label: '11–25', min: 11, max: 25 },
  { label: '26–50', min: 26, max: 50 },
  { label: '51–100', min: 51, max: 100 },
  { label: '100+', min: 101, max: null },
];

// GET /api/industries/stats — aggregate statistics for the industry dashboard
export async function GET() {
  try {
    const [total, totalEmployees, sectorStats, subCityStats, woredaStats, withLicense, employeeCounts] =
      await Promise.all([
        db.industry.count(),
        db.industry.aggregate({ _sum: { employeeCount: true }, _avg: { employeeCount: true } }),
        db.industry.groupBy({
          by: ['sector'],
          _count: true,
          _sum: { employeeCount: true },
          orderBy: { sector: 'asc' },
        }),
        db.industry.groupBy({
          by: ['subCity'],
          _count: true,
          _sum: { employeeCount: true },
          orderBy: { subCity: 'asc' },
        }),
        db.industry.groupBy({
          by: ['subCity', 'area'],
          _count: true,
          _sum: { employeeCount: true },
          orderBy: { subCity: 'asc' },
        }),
        db.industry.count({ where: { licenseNumber: { not: null } } }),
        // Only fetch employee counts (small payload) to bucket in memory
        db.industry.findMany({ select: { employeeCount: true } }),
      ]);

    // Employee-size buckets (count of industries + employees per range)
    const employeeRanges = EMPLOYEE_BUCKETS.map((b) => {
      const rows = employeeCounts.filter(
        (r) => r.employeeCount >= b.min && (b.max === null || r.employeeCount <= b.max)
      );
      return {
        label: b.label,
        min: b.min,
        max: b.max,
        count: rows.length,
        employees: rows.reduce((sum, r) => sum + r.employeeCount, 0),
      };
    }).filter((r) => r.count > 0 || r.min === 0);

    // Merge woreda counts into sub-city structure
    const woredaBySubCity: Record<string, { area: string; count: number; employees: number }[]> = {};
    for (const w of woredaStats) {
      if (!woredaBySubCity[w.subCity]) woredaBySubCity[w.subCity] = [];
      woredaBySubCity[w.subCity].push({
        area: w.area,
        count: w._count,
        employees: w._sum.employeeCount || 0,
      });
    }

    // Uniform chart buckets per groupable attribute (see lib/stats-attributes.ts).
    // Each bucket carries the /api/industries filter for its click-through dialog.
    const attributeBuckets: Record<
      string,
      { label: string; subLabel?: string; count: number; employees: number; filter: Record<string, string> }[]
    > = {
      category: sectorStats.map((s) => ({
        label: s.sector,
        count: s._count,
        employees: s._sum.employeeCount || 0,
        filter: { sector: s.sector },
      })),
      subCity: subCityStats.map((s) => ({
        label: s.subCity,
        count: s._count,
        employees: s._sum.employeeCount || 0,
        filter: { subCity: s.subCity },
      })),
      woreda: woredaStats.map((w) => ({
        label: w.area,
        subLabel: w.subCity,
        count: w._count,
        employees: w._sum.employeeCount || 0,
        filter: { subCity: w.subCity, area: w.area },
      })),
      employees: employeeRanges.map((r) => ({
        label: r.label,
        count: r.count,
        employees: r.employees,
        filter:
          r.max === null
            ? { minEmployees: String(r.min) }
            : { minEmployees: String(r.min), maxEmployees: String(r.max) },
      })),
    };

    return NextResponse.json({
      total,
      totalEmployees: totalEmployees._sum.employeeCount || 0,
      avgEmployees: Math.round((totalEmployees._avg.employeeCount || 0) * 10) / 10,
      withLicense,
      sectors: sectorStats.map((s) => ({
        sector: s.sector,
        count: s._count,
        employees: s._sum.employeeCount || 0,
      })),
      woredas: woredaStats
        .map((w) => ({
          subCity: w.subCity,
          area: w.area,
          count: w._count,
          employees: w._sum.employeeCount || 0,
        }))
        .sort((a, b) => b.count - a.count),
      employeeRanges,
      subCities: subCityStats.map((s) => ({
        subCity: s.subCity,
        count: s._count,
        employees: s._sum.employeeCount || 0,
        woredas: (woredaBySubCity[s.subCity] || []).sort((a, b) => b.count - a.count),
      })),
      attributeBuckets,
    });
  } catch (error) {
    console.error('Error fetching industry stats:', error);
    return NextResponse.json({ error: 'Failed to fetch industry stats' }, { status: 500 });
  }
}
