import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { loadSectorSurveyFields, resolveCustomAnswers } from '@/lib/survey-fields-server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guestHouse = await db.guestHouse.delete({
      where: { id },
    });
    return NextResponse.json(guestHouse);
  } catch (error) {
    console.error('Error deleting guest house:', error);
    return NextResponse.json(
      { error: 'Failed to delete guest house record' },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guestHouse = await db.guestHouse.findUnique({
      where: { id },
    });
    if (!guestHouse) {
      return NextResponse.json(
        { error: 'Guest house not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(guestHouse);
  } catch (error) {
    console.error('Error fetching guest house:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guest house' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.guestHouse.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Record not found' },
        { status: 404 }
      );
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

    // Admin-added custom questionnaire answers — sanitize against the current
    // questionnaire when the edit payload mentions them, otherwise keep stored.
    let customAnswers: Record<string, string> | undefined = undefined;
    if (body.customAnswers !== undefined) {
      const surveyFields = await loadSectorSurveyFields('guesthouse');
      const { answers, missing } = resolveCustomAnswers(surveyFields, body.customAnswers);
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: 'Missing required fields',
            missing: Object.fromEntries(missing.map((f) => [f.key, true])),
          },
          { status: 400 }
        );
      }
      customAnswers = answers;
    }

    const updated = await db.guestHouse.update({
      where: { id },
      data: {
        guestHouseName: body.organizationName || existing.guestHouseName,
        organizationName: body.organizationName ?? existing.organizationName,
        subCity: body.subCity ?? existing.subCity,
        area: body.area ?? existing.area,
        specificAddress: body.specificAddress ?? existing.specificAddress,
        numberOfRooms: body.numberOfRooms != null ? Number(body.numberOfRooms) : existing.numberOfRooms,
        licenseType: body.licenseType ?? existing.licenseType,
        licenseLevel: body.licenseLevel ?? existing.licenseLevel,
        licenseNumber: body.licenseNumber ?? existing.licenseNumber,
        contactPhone: body.contactPhone ?? existing.contactPhone,
        contactName: body.contactName ?? existing.contactName,
        ownerName: body.ownerName ?? existing.ownerName,
        customAnswers: body.customAnswers !== undefined
          ? (Object.keys(customAnswers ?? {}).length > 0 ? customAnswers : Prisma.DbNull)
          : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating guest house:', error);
    return NextResponse.json(
      { error: 'Failed to update record' },
      { status: 500 }
    );
  }
}
