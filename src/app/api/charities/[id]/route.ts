import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { parseSexCounts } from '@/lib/sex-counts';

// GET /api/charities/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const charity = await db.charityInitiative.findUnique({ where: { id } });
    if (!charity) {
      return NextResponse.json({ error: 'Charity record not found' }, { status: 404 });
    }
    return NextResponse.json(charity);
  } catch (error) {
    console.error('Error fetching charity:', error);
    return NextResponse.json({ error: 'Failed to fetch charity' }, { status: 500 });
  }
}

// PUT /api/charities/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.charityInitiative.findUnique({ where: { id } });
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

    const beneficiaries = body.beneficiaryCount != null ? Number(body.beneficiaryCount) : null;
    if (beneficiaries != null && (!Number.isFinite(beneficiaries) || beneficiaries < 0)) {
      return NextResponse.json({ error: 'Beneficiary count must be a non-negative number' }, { status: 400 });
    }

    // Sex breakdown: fall back to the stored value per side, then validate
    // against the effective total when the payload mentions either side.
    const effectiveTotal = beneficiaries != null && Number.isFinite(beneficiaries) ? Math.round(beneficiaries) : existing.beneficiaryCount;
    let maleBeneficiaries = existing.maleBeneficiaries;
    let femaleBeneficiaries = existing.femaleBeneficiaries;
    if (body.maleBeneficiaries !== undefined || body.femaleBeneficiaries !== undefined) {
      const sex = parseSexCounts(
        body.maleBeneficiaries !== undefined ? body.maleBeneficiaries : existing.maleBeneficiaries,
        body.femaleBeneficiaries !== undefined ? body.femaleBeneficiaries : existing.femaleBeneficiaries,
        effectiveTotal,
        'Beneficiary Count',
      );
      if (!sex.ok) {
        return NextResponse.json({ error: sex.error }, { status: 400 });
      }
      maleBeneficiaries = sex.male;
      femaleBeneficiaries = sex.female;
    }

    const volunteers = body.volunteerCount != null && body.volunteerCount !== '' ? Number(body.volunteerCount) : null;
    if (volunteers != null && (!Number.isFinite(volunteers) || volunteers < 0)) {
      return NextResponse.json({ error: 'Volunteer count must be a non-negative number' }, { status: 400 });
    }

    const budget = body.annualBudget != null && body.annualBudget !== '' ? Number(body.annualBudget) : null;
    if (budget != null && (!Number.isFinite(budget) || budget < 0)) {
      return NextResponse.json({ error: 'Annual budget must be a non-negative number' }, { status: 400 });
    }

    const toBool = (v: unknown) => v === true || v === 'true' || v === 'yes' || v === 1;

    const updated = await db.charityInitiative.update({
      where: { id },
      data: {
        organizationName: body.organizationName ?? existing.organizationName,
        organizationType: body.organizationType ?? existing.organizationType,
        charityType: body.charityType ?? existing.charityType,
        subCity: body.subCity ?? existing.subCity,
        area: body.area ?? existing.area,
        specificAddress: body.specificAddress ?? existing.specificAddress,
        registrationNumber: body.registrationNumber ?? existing.registrationNumber,
        beneficiaryCount: beneficiaries != null && Number.isFinite(beneficiaries) ? Math.round(beneficiaries) : existing.beneficiaryCount,
        maleBeneficiaries: maleBeneficiaries,
        femaleBeneficiaries: femaleBeneficiaries,
        volunteerCount: volunteers != null && Number.isFinite(volunteers) ? Math.round(volunteers) : existing.volunteerCount,
        annualBudget: body.annualBudget !== undefined
          ? (budget != null && Number.isFinite(budget) ? budget : null)
          : existing.annualBudget,
        hasLegalRegistration: body.hasLegalRegistration != null ? toBool(body.hasLegalRegistration) : existing.hasLegalRegistration,
        contactName: body.contactName ?? existing.contactName,
        contactPhone: body.contactPhone ?? existing.contactPhone,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating charity:', error);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

// DELETE /api/charities/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const charity = await db.charityInitiative.delete({ where: { id } });
    return NextResponse.json(charity);
  } catch (error) {
    console.error('Error deleting charity:', error);
    return NextResponse.json({ error: 'Failed to delete charity record' }, { status: 500 });
  }
}
