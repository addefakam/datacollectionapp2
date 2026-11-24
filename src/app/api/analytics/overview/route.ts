import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { splitInstitutionTypes } from '@/lib/location-data';

// GET /api/analytics/overview — cross-module insight aggregation for the
// Dhibayyuu Sub-City analytics dashboard. Everything is computed in memory
// from one findMany per module so multi-value fields (e.g. institution types)
// can be split and grouped freely.
export async function GET() {
  try {
    const [industries, guestHouses, healthFacilities, educationCenters, farms, smallEnterprises, meetingCount, collectorCount] =
      await Promise.all([
        db.industry.findMany({
          select: {
            sector: true,
            subCity: true,
            employeeCount: true,
            maleEmployees: true,
            femaleEmployees: true,
            createdAt: true,
          },
        }),
        db.guestHouse.findMany({
          select: {
            subCity: true,
            numberOfRooms: true,
            licenseLevel: true,
            serviceRating: true,
            hasRestaurant: true,
            hasParking: true,
            hasWiFi: true,
            hasHotWater: true,
            createdAt: true,
          },
        }),
        db.healthCenter.findMany({
          select: {
            subCity: true,
            facilityType: true,
            staffCount: true,
            maleStaff: true,
            femaleStaff: true,
            bedCount: true,
            hasLaboratory: true,
            hasPharmacy: true,
            hasMaternity: true,
            hasEmergency: true,
            createdAt: true,
          },
        }),
        db.educationCenter.findMany({
          select: {
            subCity: true,
            institutionType: true,
            studentCount: true,
            maleStudents: true,
            femaleStudents: true,
            teacherCount: true,
            maleTeachers: true,
            femaleTeachers: true,
            classroomCount: true,
            hasLibrary: true,
            hasLaboratory: true,
            hasComputerLab: true,
            hasFeedingProgram: true,
            createdAt: true,
          },
        }),
        db.agricultureCenter.findMany({
          select: {
            subCity: true,
            farmType: true,
            landSizeHectares: true,
            workerCount: true,
            maleWorkers: true,
            femaleWorkers: true,
            hasIrrigation: true,
            hasGreenhouse: true,
            hasMachinery: true,
            hasStorage: true,
            createdAt: true,
          },
        }),
        db.smallEnterprise.findMany({
          select: {
            subCity: true,
            enterpriseType: true,
            employeeCount: true,
            maleEmployees: true,
            femaleEmployees: true,
            startupCapital: true,
            createdAt: true,
          },
        }),
        db.meeting.count(),
        db.user.count({ where: { role: 'COLLECTOR' } }),
      ]);

    // --- helpers -----------------------------------------------------------
    const sumBy = <T, K extends keyof T>(rows: T[], key: K): number =>
      rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);
    const countTrue = <T, K extends keyof T>(rows: T[], key: K): number =>
      rows.filter((r) => Boolean(r[key])).length;
    const groupCount = <T, K extends keyof T>(rows: T[], key: K) => {
      const map: Record<string, number> = {};
      for (const r of rows) {
        const label = String(r[key] ?? 'Unspecified').trim() || 'Unspecified';
        map[label] = (map[label] || 0) + 1;
      }
      return Object.entries(map)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    };

    // --- module record counts ----------------------------------------------
    const modules = [
      { key: 'industry', label: 'Industry', count: industries.length },
      { key: 'hotel', label: 'Hotel & Guest House', count: guestHouses.length },
      { key: 'health', label: 'Health', count: healthFacilities.length },
      { key: 'education', label: 'Education', count: educationCenters.length },
      { key: 'agriculture', label: 'Agriculture', count: farms.length },
      { key: 'small-enterprise', label: 'Small Enterprise', count: smallEnterprises.length },
    ];
    const totalRecords = modules.reduce((acc, m) => acc + m.count, 0);

    // --- numeric totals ------------------------------------------------------
    const totals = {
      employees: sumBy(industries, 'employeeCount'),
      maleEmployees: sumBy(industries, 'maleEmployees'),
      femaleEmployees: sumBy(industries, 'femaleEmployees'),
      students: sumBy(educationCenters, 'studentCount'),
      maleStudents: sumBy(educationCenters, 'maleStudents'),
      femaleStudents: sumBy(educationCenters, 'femaleStudents'),
      teachers: sumBy(educationCenters, 'teacherCount'),
      maleTeachers: sumBy(educationCenters, 'maleTeachers'),
      femaleTeachers: sumBy(educationCenters, 'femaleTeachers'),
      healthStaff: sumBy(healthFacilities, 'staffCount'),
      maleStaff: sumBy(healthFacilities, 'maleStaff'),
      femaleStaff: sumBy(healthFacilities, 'femaleStaff'),
      beds: sumBy(healthFacilities, 'bedCount'),
      workers: sumBy(farms, 'workerCount'),
      maleWorkers: sumBy(farms, 'maleWorkers'),
      femaleWorkers: sumBy(farms, 'femaleWorkers'),
      landHectares: Math.round(sumBy(farms, 'landSizeHectares') * 100) / 100,
      rooms: sumBy(guestHouses, 'numberOfRooms'),
      classrooms: sumBy(educationCenters, 'classroomCount'),
      mseEmployees: sumBy(smallEnterprises, 'employeeCount'),
      mseMaleEmployees: sumBy(smallEnterprises, 'maleEmployees'),
      mseFemaleEmployees: sumBy(smallEnterprises, 'femaleEmployees'),
      mseCapital: Math.round(sumBy(smallEnterprises, 'startupCapital')),
    };

    // --- people counted, by sex (employees + students + staff + workers) ----
    const male =
      totals.maleEmployees + totals.maleStudents + totals.maleTeachers + totals.maleStaff + totals.maleWorkers +
      totals.mseMaleEmployees;
    const female =
      totals.femaleEmployees + totals.femaleStudents + totals.femaleTeachers + totals.femaleStaff + totals.femaleWorkers +
      totals.mseFemaleEmployees;
    const people = { male, female, total: male + female };

    // --- distributions -------------------------------------------------------
    const industrySectors = groupCount(industries, 'sector');
    const agricultureTypes = groupCount(farms, 'farmType');
    const hotelLicenseLevels = groupCount(guestHouses, 'licenseLevel');
    const healthFacilityTypes = groupCount(healthFacilities, 'facilityType');
    const smallEnterpriseTypes = groupCount(smallEnterprises, 'enterpriseType');

    // Education institution types — comma-separated multi-values, split in memory
    const eduTypeMap: Record<string, { count: number; students: number }> = {};
    for (const r of educationCenters) {
      for (const t of splitInstitutionTypes(r.institutionType)) {
        const bucket = (eduTypeMap[t] ??= { count: 0, students: 0 });
        bucket.count += 1;
        bucket.students += r.studentCount;
      }
    }
    const educationTypes = Object.entries(eduTypeMap)
      .map(([label, v]) => ({ label, count: v.count, students: v.students }))
      .sort((a, b) => b.count - a.count);

    // --- services & amenities ------------------------------------------------
    const share = <T,>(rows: T[], count: number) => ({ count, total: rows.length });
    const hotelAmenities = [
      { label: 'Restaurant', ...share(guestHouses, countTrue(guestHouses, 'hasRestaurant')) },
      { label: 'Parking', ...share(guestHouses, countTrue(guestHouses, 'hasParking')) },
      { label: 'WiFi', ...share(guestHouses, countTrue(guestHouses, 'hasWiFi')) },
      { label: 'Hot Water', ...share(guestHouses, countTrue(guestHouses, 'hasHotWater')) },
    ];
    const healthServices = [
      { label: 'Laboratory', ...share(healthFacilities, countTrue(healthFacilities, 'hasLaboratory')) },
      { label: 'Pharmacy', ...share(healthFacilities, countTrue(healthFacilities, 'hasPharmacy')) },
      { label: 'Maternity', ...share(healthFacilities, countTrue(healthFacilities, 'hasMaternity')) },
      { label: 'Emergency (24/7)', ...share(healthFacilities, countTrue(healthFacilities, 'hasEmergency')) },
    ];
    const educationFacilities = [
      { label: 'Library', ...share(educationCenters, countTrue(educationCenters, 'hasLibrary')) },
      { label: 'Laboratory', ...share(educationCenters, countTrue(educationCenters, 'hasLaboratory')) },
      { label: 'Computer Lab', ...share(educationCenters, countTrue(educationCenters, 'hasComputerLab')) },
      { label: 'Feeding Program', ...share(educationCenters, countTrue(educationCenters, 'hasFeedingProgram')) },
    ];
    const agricultureFeatures = [
      { label: 'Irrigation', ...share(farms, countTrue(farms, 'hasIrrigation')) },
      { label: 'Greenhouse', ...share(farms, countTrue(farms, 'hasGreenhouse')) },
      { label: 'Machinery', ...share(farms, countTrue(farms, 'hasMachinery')) },
      { label: 'Storage', ...share(farms, countTrue(farms, 'hasStorage')) },
    ];

    // --- geographic coverage -------------------------------------------------
    const subCitySet = new Set<string>(
      [...industries, ...guestHouses, ...healthFacilities, ...educationCenters, ...farms, ...smallEnterprises].map((r) => r.subCity)
    );
    const subCityCoverage = Array.from(subCitySet)
      .sort()
      .map((subCity) => {
        const row = {
          subCity,
          Industry: industries.filter((r) => r.subCity === subCity).length,
          Hotel: guestHouses.filter((r) => r.subCity === subCity).length,
          Health: healthFacilities.filter((r) => r.subCity === subCity).length,
          Education: educationCenters.filter((r) => r.subCity === subCity).length,
          Agriculture: farms.filter((r) => r.subCity === subCity).length,
          'Small Enterprise': smallEnterprises.filter((r) => r.subCity === subCity).length,
        };
        return {
          ...row,
          total: row.Industry + row.Hotel + row.Health + row.Education + row.Agriculture + row['Small Enterprise'],
        };
      })
      .sort((a, b) => b.total - a.total);

    // --- monthly trend (last 6 months, all modules) --------------------------
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const now = new Date();
    const lastMonths: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      lastMonths.push({
        key: monthKey(d),
        label: d.toLocaleString('en', { month: 'short' }),
      });
    }
    const bucketByMonth = (rows: { createdAt: Date }[]) => {
      const map: Record<string, number> = {};
      for (const r of rows) {
        const k = monthKey(new Date(r.createdAt));
        map[k] = (map[k] || 0) + 1;
      }
      return map;
    };
    const indM = bucketByMonth(industries);
    const hotelM = bucketByMonth(guestHouses);
    const healthM = bucketByMonth(healthFacilities);
    const eduM = bucketByMonth(educationCenters);
    const agriM = bucketByMonth(farms);
    const mseM = bucketByMonth(smallEnterprises);
    const monthly = lastMonths.map((m) => ({
      month: m.label,
      Industry: indM[m.key] || 0,
      Hotel: hotelM[m.key] || 0,
      Health: healthM[m.key] || 0,
      Education: eduM[m.key] || 0,
      Agriculture: agriM[m.key] || 0,
      'Small Enterprise': mseM[m.key] || 0,
    }));

    // --- misc ----------------------------------------------------------------
    const avgHotelRating =
      guestHouses.length > 0
        ? Math.round((sumBy(guestHouses, 'serviceRating') / guestHouses.length) * 10) / 10
        : 0;

    return NextResponse.json({
      modules,
      totalRecords,
      totals,
      people,
      industrySectors,
      educationTypes,
      agricultureTypes,
      smallEnterpriseTypes,
      hotelLicenseLevels,
      healthFacilityTypes,
      hotelAmenities,
      healthServices,
      educationFacilities,
      agricultureFeatures,
      subCityCoverage,
      monthly,
      meetings: meetingCount,
      collectors: collectorCount,
      avgHotelRating,
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics overview' }, { status: 500 });
  }
}
