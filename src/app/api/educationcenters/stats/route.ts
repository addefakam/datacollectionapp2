import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// Student enrollment buckets used by the "Student Ranges" grouping.
// max: null means open-ended (e.g. "2000+").
const STUDENT_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: '0 (none)', min: 0, max: 0 },
  { label: '1–50', min: 1, max: 50 },
  { label: '51–200', min: 51, max: 200 },
  { label: '201–500', min: 201, max: 500 },
  { label: '501–1000', min: 501, max: 1000 },
  { label: '1001–2000', min: 1001, max: 2000 },
  { label: '2000+', min: 2001, max: null },
];

// GET /api/educationcenters/stats — aggregate statistics for the education dashboard
export async function GET() {
  try {
    const [total, studentAgg, teacherAgg, classroomAgg, typeStats, subCityStats, woredaStats, withLicense, studentCounts] =
      await Promise.all([
        db.educationCenter.count(),
        db.educationCenter.aggregate({ _sum: { studentCount: true } }),
        db.educationCenter.aggregate({ _sum: { teacherCount: true } }),
        db.educationCenter.aggregate({ _sum: { classroomCount: true } }),
        db.educationCenter.groupBy({
          by: ['institutionType'],
          _count: true,
          _sum: { studentCount: true },
          orderBy: { institutionType: 'asc' },
        }),
        db.educationCenter.groupBy({
          by: ['subCity'],
          _count: true,
          _sum: { studentCount: true },
          orderBy: { subCity: 'asc' },
        }),
        db.educationCenter.groupBy({
          by: ['subCity', 'area'],
          _count: true,
          _sum: { studentCount: true },
          orderBy: { subCity: 'asc' },
        }),
        db.educationCenter.count({ where: { licenseNumber: { not: null } } }),
        // Only fetch student counts (small payload) to bucket in memory
        db.educationCenter.findMany({ select: { studentCount: true } }),
      ]);

    // Student-enrollment buckets (count of institutions + students per range)
    const studentRanges = STUDENT_BUCKETS.map((b) => {
      const rows = studentCounts.filter(
        (r) => r.studentCount >= b.min && (b.max === null || r.studentCount <= b.max)
      );
      return {
        label: b.label,
        min: b.min,
        max: b.max,
        count: rows.length,
        students: rows.length,
      };
    }).filter((r) => r.count > 0 || r.min === 0);

    // Merge woreda counts into sub-city structure
    const woredaBySubCity: Record<string, { area: string; count: number; students: number }[]> = {};
    for (const w of woredaStats) {
      if (!woredaBySubCity[w.subCity]) woredaBySubCity[w.subCity] = [];
      woredaBySubCity[w.subCity].push({
        area: w.area,
        count: w._count,
        students: w._sum.studentCount || 0,
      });
    }

    // Uniform chart buckets per groupable attribute.
    // Each bucket carries the /api/educationcenters filter for its click-through dialog.
    const attributeBuckets: Record<
      string,
      { label: string; subLabel?: string; count: number; students: number; filter: Record<string, string> }[]
    > = {
      institutionType: typeStats.map((t) => ({
        label: t.institutionType,
        count: t._count,
        students: t._sum.studentCount || 0,
        filter: { institutionType: t.institutionType },
      })),
      subCity: subCityStats.map((s) => ({
        label: s.subCity,
        count: s._count,
        students: s._sum.studentCount || 0,
        filter: { subCity: s.subCity },
      })),
      woreda: woredaStats.map((w) => ({
        label: w.area,
        subLabel: w.subCity,
        count: w._count,
        students: w._sum.studentCount || 0,
        filter: { subCity: w.subCity, area: w.area },
      })),
      students: studentRanges.map((r) => {
        const filter: Record<string, string> =
          r.max === null
            ? { minStudents: String(r.min) }
            : { minStudents: String(r.min), maxStudents: String(r.max) };
        return {
          label: r.label,
          count: r.count,
          students: r.students,
          filter,
        };
      }),
    };

    return NextResponse.json({
      total,
      totalStudents: studentAgg._sum.studentCount || 0,
      totalTeachers: teacherAgg._sum.teacherCount || 0,
      totalClassrooms: classroomAgg._sum.classroomCount || 0,
      withLicense,
      types: typeStats.map((t) => ({
        institutionType: t.institutionType,
        count: t._count,
        students: t._sum.studentCount || 0,
      })),
      woredas: woredaStats
        .map((w) => ({
          subCity: w.subCity,
          area: w.area,
          count: w._count,
          students: w._sum.studentCount || 0,
        }))
        .sort((a, b) => b.count - a.count),
      studentRanges,
      subCities: subCityStats.map((s) => ({
        subCity: s.subCity,
        count: s._count,
        students: s._sum.studentCount || 0,
        woredas: (woredaBySubCity[s.subCity] || []).sort((a, b) => b.count - a.count),
      })),
      attributeBuckets,
    });
  } catch (error) {
    console.error('Error fetching education center stats:', error);
    return NextResponse.json({ error: 'Failed to fetch education center stats' }, { status: 500 });
  }
}
