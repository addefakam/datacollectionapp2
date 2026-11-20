import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/industries — create an industry record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      establishmentName,
      sector,
      subCity,
      area,
      specificAddress,
      licenseNumber,
      ownershipType,
      employeeCount,
      startupCapital,
      contactName,
      contactPhone,
      surveyorName,
      surveyorId,
    } = body;

    // Validate required fields
    if (!establishmentName || !sector || !subCity || !area || !specificAddress || !ownershipType || !contactName || !contactPhone) {
      return NextResponse.json(
        { error: 'Missing required fields', missing: { establishmentName: !establishmentName, sector: !sector, subCity: !subCity, area: !area, specificAddress: !specificAddress, ownershipType: !ownershipType, contactName: !contactName, contactPhone: !contactPhone } },
        { status: 400 }
      );
    }

    // Validate employee count
    const employees = Number(employeeCount);
    if (!Number.isFinite(employees) || employees < 0) {
      return NextResponse.json(
        { error: 'Employee count must be a non-negative number' },
        { status: 400 }
      );
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

    const capital = startupCapital != null && startupCapital !== '' ? Number(startupCapital) : null;

    const industry = await db.industry.create({
      data: {
        establishmentName,
        sector,
        subCity,
        area,
        specificAddress: specificAddress || '',
        licenseNumber: licenseNumber || null,
        ownershipType,
        employeeCount: Math.round(employees),
        startupCapital: capital != null && Number.isFinite(capital) ? capital : null,
        contactName,
        contactPhone,
        surveyorName: surveyorName || null,
        surveyorId: surveyorId || null,
      },
    });

    return NextResponse.json(industry, { status: 201 });
  } catch (error) {
    console.error('Error creating industry record:', error);
    return NextResponse.json(
      { error: 'Failed to create industry record', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// GET /api/industries?subCity=&area=&sector=&search=&page=&limit=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const sector = searchParams.get('sector');
    const search = searchParams.get('search');
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 20;

    const where: Record<string, unknown> = {};

    if (subCity) where.subCity = subCity;
    if (area) where.area = area;
    if (sector) where.sector = sector;
    if (search) {
      where.OR = [
        { establishmentName: { contains: search } },
        { specificAddress: { contains: search } },
        { contactName: { contains: search } },
        { licenseNumber: { contains: search } },
      ];
    }

    const [industries, total] = await Promise.all([
      db.industry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.industry.count({ where }),
    ]);

    return NextResponse.json({
      data: industries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching industries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch industries' },
      { status: 500 }
    );
  }
}
