import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { parseSexCounts } from '@/lib/sex-counts';
import { isSmeStatus } from '@/lib/sme';
import { canonicalArea, canonicalSubCity } from '@/lib/sme-server';
import { loadSectorSurveyFields } from '@/lib/survey-fields-server';
import { sectorSurveyFieldRequired } from '@/lib/survey-fields';

/** Accept booleans from JSON, or 'yes'/'true'/1 from offline-synced payloads. */
function toBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 'yes' || v === 1;
}

// POST /api/smallenterprises — create a small enterprise (MSE) record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      enterpriseName,
      enterpriseType,
      ownershipType,
      subCity,
      area,
      specificAddress,
      licenseNumber,
      employeeCount,
      maleEmployees,
      femaleEmployees,
      startupCapital,
      hasPremises,
      hasTraining,
      contactName,
      contactPhone,
      surveyorName,
      surveyorId,
    } = body;

    // Validate required fields — the required set follows the admin-managed
    // questionnaire (Manage → Survey Questions): locked fields are always
    // required, configurable ones only when the questionnaire shows them as
    // required.
    const surveyFields = await loadSectorSurveyFields('small-enterprise');
    const need = (key: string): boolean => sectorSurveyFieldRequired('small-enterprise', surveyFields, key);
    if (
      !enterpriseName ||
      !enterpriseType ||
      !subCity ||
      !area ||
      !contactName ||
      !contactPhone ||
      (need('ownershipType') && !ownershipType) ||
      (need('specificAddress') && !specificAddress)
    ) {
      return NextResponse.json(
        { error: 'Missing required fields', missing: { enterpriseName: !enterpriseName, enterpriseType: !enterpriseType, ownershipType: need('ownershipType') && !ownershipType, subCity: !subCity, area: !area, specificAddress: need('specificAddress') && !specificAddress, contactName: !contactName, contactPhone: !contactPhone } },
        { status: 400 }
      );
    }

    // Validate employee count
    const employees = Number(employeeCount ?? 0);
    if (!Number.isFinite(employees) || employees < 0) {
      return NextResponse.json({ error: 'Employee count must be a non-negative number' }, { status: 400 });
    }

    // Optional sex breakdown (male/female) — must add up to the total when given
    const sex = parseSexCounts(maleEmployees, femaleEmployees, employees, 'Employee Count');
    if (!sex.ok) {
      return NextResponse.json({ error: sex.error }, { status: 400 });
    }

    // Validate capital when provided
    const capital = startupCapital != null && startupCapital !== '' ? Number(startupCapital) : null;
    if (capital != null && (!Number.isFinite(capital) || capital < 0)) {
      return NextResponse.json({ error: 'Startup capital must be a non-negative number' }, { status: 400 });
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

    // Establishment status — defaults to REGISTERED, must be a known lifecycle value
    const status = isSmeStatus(body.status) ? body.status : 'REGISTERED';

    // Canonical scope names — store the Settings spelling so the target and
    // performance aggregates match these records (tolerates import casing).
    const scopeSubCity = await canonicalSubCity(String(subCity));
    const scopeArea = await canonicalArea(scopeSubCity, String(area));

    const smallEnterprise = await db.smallEnterprise.create({
      data: {
        enterpriseName,
        enterpriseType,
        ownershipType: ownershipType || '', // hidden question stores an empty value
        subCity: scopeSubCity,
        area: scopeArea,
        specificAddress: specificAddress || '',
        licenseNumber: licenseNumber || null,
        employeeCount: Math.round(employees),
        maleEmployees: sex.male,
        femaleEmployees: sex.female,
        startupCapital: capital,
        hasPremises: toBool(hasPremises),
        hasTraining: toBool(hasTraining),
        status,
        statusUpdatedAt: status === 'REGISTERED' ? null : new Date(),
        contactName,
        contactPhone,
        surveyorName: surveyorName || null,
        surveyorId: surveyorId || null,
      },
    });

    return NextResponse.json(smallEnterprise, { status: 201 });
  } catch (error) {
    console.error('Error creating small enterprise record:', error);
    return NextResponse.json(
      { error: 'Failed to create small enterprise record', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// GET /api/smallenterprises?subCity=&area=&enterpriseType=&ownershipType=&search=&minEmployees=&maxEmployees=&page=&limit=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const enterpriseType = searchParams.get('enterpriseType');
    const ownershipType = searchParams.get('ownershipType');
    const search = searchParams.get('search');
    const minEmployees = searchParams.get('minEmployees');
    const maxEmployees = searchParams.get('maxEmployees');
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 20;

    const where: Record<string, unknown> = {};

    if (subCity) where.subCity = { equals: subCity, mode: 'insensitive' };
    if (area) where.area = { equals: area, mode: 'insensitive' };
    if (enterpriseType) where.enterpriseType = enterpriseType;
    // Click-through filters for the stats dimensions
    if (ownershipType) where.ownershipType = ownershipType;
    // Establishment status filter — one status or a comma-separated list;
    // `pending=1` → every stage not yet operational.
    const status = searchParams.get('status');
    if (status) {
      const list = status.split(',').flatMap((s) => (isSmeStatus(s.trim()) ? [s.trim()] : []));
      if (list.length === 1) where.status = list[0];
      else if (list.length > 1) where.status = { in: list };
    }
    if (searchParams.get('pending') === '1') {
      where.status = { ...(where.status as Record<string, unknown> | undefined), not: 'OPERATIONAL' };
    }
    if (minEmployees !== null && minEmployees !== '') {
      where.employeeCount = { ...(where.employeeCount as Record<string, number> | undefined), gte: Number(minEmployees) };
    }
    if (maxEmployees !== null && maxEmployees !== '') {
      where.employeeCount = { ...(where.employeeCount as Record<string, number> | undefined), lte: Number(maxEmployees) };
    }
    if (search) {
      where.OR = [
        { enterpriseName: { contains: search } },
        { specificAddress: { contains: search } },
        { contactName: { contains: search } },
        { licenseNumber: { contains: search } },
      ];
    }

    const [smallEnterprises, total] = await Promise.all([
      db.smallEnterprise.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.smallEnterprise.count({ where }),
    ]);

    return NextResponse.json({
      data: smallEnterprises,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching small enterprises:', error);
    return NextResponse.json(
      { error: 'Failed to fetch small enterprises' },
      { status: 500 }
    );
  }
}
