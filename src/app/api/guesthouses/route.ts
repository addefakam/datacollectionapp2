import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { loadSectorSurveyFields, resolveCustomAnswers } from '@/lib/survey-fields-server';
import { sectorSurveyFieldRequired } from '@/lib/survey-fields';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      organizationName,
      subCity,
      area,
      specificAddress,
      numberOfRooms,
      licenseType,
      licenseLevel,
      licenseNumber,
      serviceRating,
      contactPhone,
      contactName,
      contactPhone2,
      contactName2,
      ownerName,
      hasRestaurant,
      hasParking,
      hasWiFi,
      hasHotWater,
      additionalServices,
      surveyorName,
      surveyorId,
      signature,
    } = body;

    // Validate required fields from the 4-step form — the required set follows
    // the admin-managed questionnaire (Manage → Survey Questions): locked
    // fields are always required, configurable ones only when the
    // questionnaire shows them as required.
    const surveyFields = await loadSectorSurveyFields('guesthouse');
    const need = (key: string): boolean => sectorSurveyFieldRequired('guesthouse', surveyFields, key);
    if (
      !organizationName ||
      !subCity ||
      !area ||
      !numberOfRooms ||
      !contactName ||
      !contactPhone ||
      (need('specificAddress') && !specificAddress) ||
      (need('licenseType') && !licenseType) ||
      (need('licenseLevel') && !licenseLevel) ||
      (need('licenseNumber') && !licenseNumber) ||
      (need('ownerName') && !ownerName)
    ) {
      return NextResponse.json(
        { error: 'Missing required fields', missing: { organizationName: !organizationName, subCity: !subCity, area: !area, specificAddress: need('specificAddress') && !specificAddress, numberOfRooms: !numberOfRooms, licenseType: need('licenseType') && !licenseType, licenseLevel: need('licenseLevel') && !licenseLevel, licenseNumber: need('licenseNumber') && !licenseNumber, ownerName: need('ownerName') && !ownerName, contactName: !contactName, contactPhone: !contactPhone } },
        { status: 400 }
      );
    }

    // Admin-added custom questions (Administration → Settings → Survey):
    // keep only enabled ones, validate the required ones.
    const { answers: customAnswers, missing: missingCustom } = resolveCustomAnswers(surveyFields, body.customAnswers);
    if (missingCustom.length > 0) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          missing: Object.fromEntries(missingCustom.map((f) => [f.key, true])),
        },
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

    const guestHouse = await db.guestHouse.create({
      data: {
        guestHouseName: organizationName, // Use organization name as guest house name
        organizationName: organizationName || null,
        subCity,
        area,
        specificAddress: specificAddress || '',
        numberOfRooms: Number(numberOfRooms) || 0,
        licenseType: licenseType || '', // hidden question stores an empty value
        licenseLevel: licenseLevel || '', // hidden question stores an empty value
        licenseNumber: licenseNumber || null,
        serviceRating: Number(serviceRating) || 0,
        contactPhone: contactPhone || null,
        contactName: contactName || null,
        contactPhone2: contactPhone2 || null,
        contactName2: contactName2 || null,
        ownerName: ownerName || null,
        hasRestaurant: Boolean(hasRestaurant),
        hasParking: Boolean(hasParking),
        hasWiFi: Boolean(hasWiFi),
        hasHotWater: Boolean(hasHotWater),
        additionalServices: additionalServices || null,
        surveyorName: surveyorName || null,
        surveyorId: surveyorId || null,
        signature: signature || null,
        customAnswers: Object.keys(customAnswers).length > 0 ? customAnswers : undefined,
      },
    });

    return NextResponse.json(guestHouse, { status: 201 });
  } catch (error) {
    console.error('Error creating guest house:', error);
    return NextResponse.json(
      { error: 'Failed to create guest house record', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const search = searchParams.get('search');
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 20;

    const where: Record<string, unknown> = {};

    if (subCity) {
      where.subCity = subCity;
    }
    if (area) {
      where.area = area;
    }
    if (search) {
      where.OR = [
        { guestHouseName: { contains: search } },
        { organizationName: { contains: search } },
        { specificAddress: { contains: search } },
        { ownerName: { contains: search } },
        { contactName: { contains: search } },
        { contactName2: { contains: search } },
      ];
    }

    const [guestHouses, total] = await Promise.all([
      db.guestHouse.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.guestHouse.count({ where }),
    ]);

    return NextResponse.json({
      data: guestHouses,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching guest houses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guest houses' },
      { status: 500 }
    );
  }
}
