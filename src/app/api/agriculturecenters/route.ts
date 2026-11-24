import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { parseSexCounts } from '@/lib/sex-counts';

/** Accept booleans from JSON, or 'yes'/'true'/1 from offline-synced payloads. */
function toBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 'yes' || v === 1;
}

// POST /api/agriculturecenters — create a farm establishment record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      farmName,
      farmType,
      ownershipType,
      subCity,
      area,
      specificAddress,
      licenseNumber,
      landSizeHectares,
      workerCount,
      maleWorkers,
      femaleWorkers,
      hasIrrigation,
      hasGreenhouse,
      hasMachinery,
      hasStorage,
      contactName,
      contactPhone,
      surveyorName,
      surveyorId,
    } = body;

    // Validate required fields
    if (!farmName || !farmType || !ownershipType || !subCity || !area || !specificAddress || !contactName || !contactPhone) {
      return NextResponse.json(
        { error: 'Missing required fields', missing: { farmName: !farmName, farmType: !farmType, ownershipType: !ownershipType, subCity: !subCity, area: !area, specificAddress: !specificAddress, contactName: !contactName, contactPhone: !contactPhone } },
        { status: 400 }
      );
    }

    // Validate worker count and land size
    const workers = Number(workerCount ?? 0);
    const land = Number(landSizeHectares ?? 0);
    if (!Number.isFinite(workers) || workers < 0) {
      return NextResponse.json({ error: 'Worker count must be a non-negative number' }, { status: 400 });
    }

    // Optional sex breakdown (male/female) — must add up to the total when given
    const sex = parseSexCounts(maleWorkers, femaleWorkers, workers, 'Worker Count');
    if (!sex.ok) {
      return NextResponse.json({ error: sex.error }, { status: 400 });
    }
    if (!Number.isFinite(land) || land < 0) {
      return NextResponse.json({ error: 'Land size must be a non-negative number' }, { status: 400 });
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

    const agricultureCenter = await db.agricultureCenter.create({
      data: {
        farmName,
        farmType,
        ownershipType,
        subCity,
        area,
        specificAddress: specificAddress || '',
        licenseNumber: licenseNumber || null,
        landSizeHectares: Math.round(land * 100) / 100,
        workerCount: Math.round(workers),
        maleWorkers: sex.male,
        femaleWorkers: sex.female,
        hasIrrigation: toBool(hasIrrigation),
        hasGreenhouse: toBool(hasGreenhouse),
        hasMachinery: toBool(hasMachinery),
        hasStorage: toBool(hasStorage),
        contactName,
        contactPhone,
        surveyorName: surveyorName || null,
        surveyorId: surveyorId || null,
      },
    });

    return NextResponse.json(agricultureCenter, { status: 201 });
  } catch (error) {
    console.error('Error creating agriculture center record:', error);
    return NextResponse.json(
      { error: 'Failed to create agriculture center record', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// GET /api/agriculturecenters?subCity=&area=&farmType=&ownershipType=&search=&minLand=&maxLand=&page=&limit=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const farmType = searchParams.get('farmType');
    const ownershipType = searchParams.get('ownershipType');
    const search = searchParams.get('search');
    const minLand = searchParams.get('minLand');
    const maxLand = searchParams.get('maxLand');
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 20;

    const where: Record<string, unknown> = {};

    if (subCity) where.subCity = subCity;
    if (area) where.area = area;
    if (farmType) where.farmType = farmType;
    // Click-through filters for the chart's Ownership / Farm type dimensions
    if (ownershipType) where.ownershipType = ownershipType;
    if (minLand !== null && minLand !== '') {
      where.landSizeHectares = { ...(where.landSizeHectares as Record<string, number> | undefined), gte: Number(minLand) };
    }
    if (maxLand !== null && maxLand !== '') {
      where.landSizeHectares = { ...(where.landSizeHectares as Record<string, number> | undefined), lte: Number(maxLand) };
    }
    if (search) {
      where.OR = [
        { farmName: { contains: search } },
        { specificAddress: { contains: search } },
        { contactName: { contains: search } },
        { licenseNumber: { contains: search } },
      ];
    }

    const [agricultureCenters, total] = await Promise.all([
      db.agricultureCenter.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.agricultureCenter.count({ where }),
    ]);

    return NextResponse.json({
      data: agricultureCenters,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching agriculture centers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agriculture centers' },
      { status: 500 }
    );
  }
}
