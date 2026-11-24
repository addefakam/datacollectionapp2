import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { parseSexCounts } from '@/lib/sex-counts';

// GET /api/smallenterprises/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const smallEnterprise = await db.smallEnterprise.findUnique({ where: { id } });
    if (!smallEnterprise) {
      return NextResponse.json({ error: 'Small enterprise record not found' }, { status: 404 });
    }
    return NextResponse.json(smallEnterprise);
  } catch (error) {
    console.error('Error fetching small enterprise:', error);
    return NextResponse.json({ error: 'Failed to fetch small enterprise' }, { status: 500 });
  }
}

// PUT /api/smallenterprises/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.smallEnterprise.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    // Validate phone if provided
    if (body.contactPhone) {
      const phoneClean = String(body.contactPhone).replace(/[\s-]/g, '');
      const ethPhoneRegex = /^(\+251|251|0)?(9|7)\d{8}$/;
      if (!ethPhoneRegex.test(phoneClean)) {
        return NextResponse.json(
          { error: 'Invalid phone number. Use Ethiopian format: +251 9X XXX XXXX or 09XXXXXXXX' },
          { status: 400 }
        );
      }
    }

    const employees = body.employeeCount != null ? Number(body.employeeCount) : null;
    if (employees != null && (!Number.isFinite(employees) || employees < 0)) {
      return NextResponse.json({ error: 'Employee count must be a non-negative number' }, { status: 400 });
    }

    // Sex breakdown: fall back to the stored value per side, then validate
    // against the effective total when the payload mentions either side.
    const effectiveTotal = employees != null && Number.isFinite(employees) ? Math.round(employees) : existing.employeeCount;
    let maleEmployees = existing.maleEmployees;
    let femaleEmployees = existing.femaleEmployees;
    if (body.maleEmployees !== undefined || body.femaleEmployees !== undefined) {
      const sex = parseSexCounts(
        body.maleEmployees !== undefined ? body.maleEmployees : existing.maleEmployees,
        body.femaleEmployees !== undefined ? body.femaleEmployees : existing.femaleEmployees,
        effectiveTotal,
        'Employee Count',
      );
      if (!sex.ok) {
        return NextResponse.json({ error: sex.error }, { status: 400 });
      }
      maleEmployees = sex.male;
      femaleEmployees = sex.female;
    }

    const capital = body.startupCapital != null && body.startupCapital !== '' ? Number(body.startupCapital) : null;
    if (capital != null && (!Number.isFinite(capital) || capital < 0)) {
      return NextResponse.json({ error: 'Startup capital must be a non-negative number' }, { status: 400 });
    }

    const toBool = (v: unknown) => v === true || v === 'true' || v === 'yes' || v === 1;

    const updated = await db.smallEnterprise.update({
      where: { id },
      data: {
        enterpriseName: body.enterpriseName ?? existing.enterpriseName,
        enterpriseType: body.enterpriseType ?? existing.enterpriseType,
        ownershipType: body.ownershipType ?? existing.ownershipType,
        subCity: body.subCity ?? existing.subCity,
        area: body.area ?? existing.area,
        specificAddress: body.specificAddress ?? existing.specificAddress,
        licenseNumber: body.licenseNumber ?? existing.licenseNumber,
        employeeCount: employees != null && Number.isFinite(employees) ? Math.round(employees) : existing.employeeCount,
        maleEmployees: maleEmployees,
        femaleEmployees: femaleEmployees,
        startupCapital: body.startupCapital !== undefined
          ? (capital != null && Number.isFinite(capital) ? capital : null)
          : existing.startupCapital,
        hasPremises: body.hasPremises != null ? toBool(body.hasPremises) : existing.hasPremises,
        hasTraining: body.hasTraining != null ? toBool(body.hasTraining) : existing.hasTraining,
        contactName: body.contactName ?? existing.contactName,
        contactPhone: body.contactPhone ?? existing.contactPhone,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating small enterprise:', error);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

// DELETE /api/smallenterprises/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const smallEnterprise = await db.smallEnterprise.delete({ where: { id } });
    return NextResponse.json(smallEnterprise);
  } catch (error) {
    console.error('Error deleting small enterprise:', error);
    return NextResponse.json({ error: 'Failed to delete small enterprise record' }, { status: 500 });
  }
}
