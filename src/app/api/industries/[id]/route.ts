import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/industries/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const industry = await db.industry.findUnique({ where: { id } });
    if (!industry) {
      return NextResponse.json({ error: 'Industry record not found' }, { status: 404 });
    }
    return NextResponse.json(industry);
  } catch (error) {
    console.error('Error fetching industry:', error);
    return NextResponse.json({ error: 'Failed to fetch industry' }, { status: 500 });
  }
}

// PUT /api/industries/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.industry.findUnique({ where: { id } });
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

    const capital = body.startupCapital != null && body.startupCapital !== '' ? Number(body.startupCapital) : null;

    const updated = await db.industry.update({
      where: { id },
      data: {
        establishmentName: body.establishmentName ?? existing.establishmentName,
        sector: body.sector ?? existing.sector,
        subCity: body.subCity ?? existing.subCity,
        area: body.area ?? existing.area,
        specificAddress: body.specificAddress ?? existing.specificAddress,
        licenseNumber: body.licenseNumber ?? existing.licenseNumber,
        ownershipType: body.ownershipType ?? existing.ownershipType,
        hasEia: body.hasEia != null
          ? (body.hasEia === true || body.hasEia === 'true' || body.hasEia === 'yes' || body.hasEia === 1)
          : existing.hasEia,
        hasEmp: body.hasEmp != null
          ? (body.hasEmp === true || body.hasEmp === 'true' || body.hasEmp === 'yes' || body.hasEmp === 1)
          : existing.hasEmp,
        employeeCount: employees != null && Number.isFinite(employees) ? Math.round(employees) : existing.employeeCount,
        startupCapital: capital != null && Number.isFinite(capital) ? capital : existing.startupCapital,
        contactName: body.contactName ?? existing.contactName,
        contactPhone: body.contactPhone ?? existing.contactPhone,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating industry:', error);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

// DELETE /api/industries/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const industry = await db.industry.delete({ where: { id } });
    return NextResponse.json(industry);
  } catch (error) {
    console.error('Error deleting industry:', error);
    return NextResponse.json({ error: 'Failed to delete industry record' }, { status: 500 });
  }
}
