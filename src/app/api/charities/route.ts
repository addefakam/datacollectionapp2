import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { parseSexCounts } from '@/lib/sex-counts';

/** Accept booleans from JSON, or 'yes'/'true'/1 from offline-synced payloads. */
function toBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 'yes' || v === 1;
}

// POST /api/charities — register a charity organization (Bussa Goonofa initiative)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      organizationName,
      organizationType,
      charityType,
      subCity,
      area,
      specificAddress,
      registrationNumber,
      beneficiaryCount,
      maleBeneficiaries,
      femaleBeneficiaries,
      volunteerCount,
      annualBudget,
      hasLegalRegistration,
      contactName,
      contactPhone,
      surveyorName,
      surveyorId,
    } = body;

    // Validate required fields
    if (!organizationName || !organizationType || !charityType || !subCity || !area || !specificAddress || !contactName || !contactPhone) {
      return NextResponse.json(
        { error: 'Missing required fields', missing: { organizationName: !organizationName, organizationType: !organizationType, charityType: !charityType, subCity: !subCity, area: !area, specificAddress: !specificAddress, contactName: !contactName, contactPhone: !contactPhone } },
        { status: 400 }
      );
    }

    // Validate beneficiary count
    const beneficiaries = Number(beneficiaryCount ?? 0);
    if (!Number.isFinite(beneficiaries) || beneficiaries < 0) {
      return NextResponse.json({ error: 'Beneficiary count must be a non-negative number' }, { status: 400 });
    }

    // Optional sex breakdown (male/female) — must add up to the total when given
    const sex = parseSexCounts(maleBeneficiaries, femaleBeneficiaries, beneficiaries, 'Beneficiary Count');
    if (!sex.ok) {
      return NextResponse.json({ error: sex.error }, { status: 400 });
    }

    // Validate volunteers when provided
    const volunteers = volunteerCount != null && volunteerCount !== '' ? Number(volunteerCount) : 0;
    if (!Number.isFinite(volunteers) || volunteers < 0) {
      return NextResponse.json({ error: 'Volunteer count must be a non-negative number' }, { status: 400 });
    }

    // Validate budget when provided
    const budget = annualBudget != null && annualBudget !== '' ? Number(annualBudget) : null;
    if (budget != null && (!Number.isFinite(budget) || budget < 0)) {
      return NextResponse.json({ error: 'Annual budget must be a non-negative number' }, { status: 400 });
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

    const charity = await db.charityInitiative.create({
      data: {
        organizationName,
        organizationType,
        charityType,
        subCity,
        area,
        specificAddress: specificAddress || '',
        registrationNumber: registrationNumber || null,
        beneficiaryCount: Math.round(beneficiaries),
        maleBeneficiaries: sex.male,
        femaleBeneficiaries: sex.female,
        volunteerCount: Math.round(volunteers),
        annualBudget: budget,
        hasLegalRegistration: toBool(hasLegalRegistration),
        contactName,
        contactPhone,
        surveyorName: surveyorName || null,
        surveyorId: surveyorId || null,
      },
    });

    return NextResponse.json(charity, { status: 201 });
  } catch (error) {
    console.error('Error creating charity record:', error);
    return NextResponse.json(
      { error: 'Failed to create charity record', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// GET /api/charities?subCity=&area=&charityType=&organizationType=&search=&minBeneficiaries=&maxBeneficiaries=&page=&limit=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const charityType = searchParams.get('charityType');
    const organizationType = searchParams.get('organizationType');
    const search = searchParams.get('search');
    const minBeneficiaries = searchParams.get('minBeneficiaries');
    const maxBeneficiaries = searchParams.get('maxBeneficiaries');
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 20;

    const where: Record<string, unknown> = {};

    if (subCity) where.subCity = subCity;
    if (area) where.area = area;
    if (charityType) where.charityType = charityType;
    // Click-through filters for the stats dimensions
    if (organizationType) where.organizationType = organizationType;
    if (minBeneficiaries !== null && minBeneficiaries !== '') {
      where.beneficiaryCount = { ...(where.beneficiaryCount as Record<string, number> | undefined), gte: Number(minBeneficiaries) };
    }
    if (maxBeneficiaries !== null && maxBeneficiaries !== '') {
      where.beneficiaryCount = { ...(where.beneficiaryCount as Record<string, number> | undefined), lte: Number(maxBeneficiaries) };
    }
    if (search) {
      where.OR = [
        { organizationName: { contains: search } },
        { specificAddress: { contains: search } },
        { contactName: { contains: search } },
        { registrationNumber: { contains: search } },
      ];
    }

    const [charities, total] = await Promise.all([
      db.charityInitiative.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.charityInitiative.count({ where }),
    ]);

    return NextResponse.json({
      data: charities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching charities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch charities' },
      { status: 500 }
    );
  }
}
