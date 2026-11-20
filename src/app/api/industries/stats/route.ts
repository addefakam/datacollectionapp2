import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/industries/stats — aggregate statistics for the industry dashboard
export async function GET() {
  try {
    const [total, totalEmployees, sectorStats, subCityStats, woredaStats, withLicense] =
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
      ]);

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
      subCities: subCityStats.map((s) => ({
        subCity: s.subCity,
        count: s._count,
        employees: s._sum.employeeCount || 0,
        woredas: (woredaBySubCity[s.subCity] || []).sort((a, b) => b.count - a.count),
      })),
    });
  } catch (error) {
    console.error('Error fetching industry stats:', error);
    return NextResponse.json({ error: 'Failed to fetch industry stats' }, { status: 500 });
  }
}
