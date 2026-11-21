import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

/** Accept booleans from JSON, or 'yes'/'true'/1 from offline-synced payloads. */
function toBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 'yes' || v === 1;
}

// POST /api/healthcenters — create a health facility record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      facilityName,
      facilityType,
      ownershipType,
      subCity,
      area,
      specificAddress,
      licenseNumber,
      staffCount,
      bedCount,
      hasLaboratory,
      hasPharmacy,
      hasMaternity,
      hasEmergency,
      contactName,
      contactPhone,
      surveyorName,
      surveyorId,
    } = body;

    // Validate required fields
    if (!facilityName || !facilityType || !ownershipType || !subCity || !area || !specificAddress || !contactName || !contactPhone) {
      return NextResponse.json(
        { error: 'Missing required fields', missing: { facilityName: !facilityName, facilityType: !facilityType, ownershipType: !ownershipType, subCity: !subCity, area: !area, specificAddress: !specificAddress, contactName: !contactName, contactPhone: !contactPhone } },
        { status: 400 }
      );
    }

    // Validate staff and bed counts
    const staff = Number(staffCount ?? 0);
    const beds = Number(bedCount ?? 0);
    if (!Number.isFinite(staff) || staff < 0) {
      return NextResponse.json({ error: 'Staff count must be a non-negative number' }, { status: 400 });
    }
    if (!Number.isFinite(beds) || beds < 0) {
      return NextResponse.json({ error: 'Bed count must be a non-negative number' }, { status: 400 });
    }

    // Validate Ethiopian phone number
    const phoneClean = String(contactPhone).replace(/[\s-]/g, '');
    const ethPhoneRegex = /^(\+251|251|0)?(9|7)\d{8}$/;
    if (!ethPhoneRegex.test(phoneClean)) {
      return NextResponse.json(
        { error: 'Invalid phone number. Use Ethiopian format: +251 9X XXX XXXX or 09XXXXXXXX' },
        { status: 400 }
      );
    }

    const healthCenter = await db.healthCenter.create({
      data: {
        facilityName,
        facilityType,
        ownershipType,
        subCity,
        area,
        specificAddress: specificAddress || '',
        licenseNumber: licenseNumber || null,
        staffCount: Math.round(staff),
        bedCount: Math.round(beds),
        hasLaboratory: toBool(hasLaboratory),
        hasPharmacy: toBool(hasPharmacy),
        hasMaternity: toBool(hasMaternity),
        hasEmergency: toBool(hasEmergency),
        contactName,
        contactPhone,
        surveyorName: surveyorName || null,
        surveyorId: surveyorId || null,
      },
    });

    return NextResponse.json(healthCenter, { status: 201 });
  } catch (error) {
    console.error('Error creating health center record:', error);
    return NextResponse.json(
      { error: 'Failed to create health center record', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// GET /api/healthcenters?subCity=&area=&facilityType=&ownershipType=&search=&minStaff=&maxStaff=&page=&limit=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const facilityType = searchParams.get('facilityType');
    const ownershipType = searchParams.get('ownershipType');
    const search = searchParams.get('search');
    const minStaff = searchParams.get('minStaff');
    const maxStaff = searchParams.get('maxStaff');
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 20;

    const where: Record<string, unknown> = {};

    if (subCity) where.subCity = subCity;
    if (area) where.area = area;
    if (facilityType) where.facilityType = facilityType;
    // Click-through filters for the chart's Ownership / Facility type dimensions
    if (ownershipType) where.ownershipType = ownershipType;
    if (minStaff !== null && minStaff !== '') {
      where.staffCount = { ...(where.staffCount as Record<string, number> | undefined), gte: Number(minStaff) };
    }
    if (maxStaff !== null && maxStaff !== '') {
      where.staffCount = { ...(where.staffCount as Record<string, number> | undefined), lte: Number(maxStaff) };
    }
    if (search) {
      where.OR = [
        { facilityName: { contains: search } },
        { specificAddress: { contains: search } },
        { contactName: { contains: search } },
        { licenseNumber: { contains: search } },
      ];
    }

    const [healthCenters, total] = await Promise.all([
      db.healthCenter.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.healthCenter.count({ where }),
    ]);

    return NextResponse.json({
      data: healthCenters,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching health centers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health centers' },
      { status: 500 }
    );
  }
}
