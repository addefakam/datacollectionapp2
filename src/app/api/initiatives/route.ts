import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api-auth';
import { loadAnalyzedInitiatives } from '@/lib/initiative-queries';

// GET /api/initiatives?status=&departmentId=&subCity=&category=&search=&delayed=true&page=&limit=
// Returns analyzed initiatives (target attainment, gap, delay, reporting status).
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const departmentId = searchParams.get('departmentId');
    const subCity = searchParams.get('subCity');
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const delayed = searchParams.get('delayed');
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50));

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    if (subCity) where.subCity = subCity;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { location: { contains: search } },
      ];
    }

    const all = await loadAnalyzedInitiatives(where);
    const filtered = delayed === 'true' ? all.filter((i) => i.analysis.delayed) : all;

    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);

    return NextResponse.json({
      data,
      total: filtered.length,
      page,
      limit,
      totalPages: Math.ceil(filtered.length / limit) || 1,
    });
  } catch (error) {
    console.error('Error fetching initiatives:', error);
    return NextResponse.json({ error: 'Failed to fetch initiatives' }, { status: 500 });
  }
}

// POST /api/initiatives — register an initiative (establishment) with its
// initial targets. Any signed-in user may register; targets may be edited
// later by an admin.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const {
      name,
      description,
      category,
      departmentId,
      subCity,
      area,
      establishmentDate,
      expectedOperationalDate,
      location,
      contactName,
      contactPhone,
      targets,
    } = body;

    if (!name || !departmentId || !subCity || !category) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          missing: {
            name: !name,
            category: !category,
            departmentId: !departmentId,
            subCity: !subCity,
          },
        },
        { status: 400 }
      );
    }

    const department = await db.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      return NextResponse.json({ error: 'Responsible department not found' }, { status: 400 });
    }

    if (contactPhone) {
      const phoneClean = String(contactPhone).replace(/[\s-]/g, '');
      const ethPhoneRegex = /^(\+251|251|0)?(9|7)\d{8}$/;
      if (!ethPhoneRegex.test(phoneClean)) {
        return NextResponse.json(
          { error: 'Invalid phone number. Use Ethiopian format: +251 9X XXX XXXX or 09XXXXXXXX' },
          { status: 400 }
        );
      }
    }

    const establishment = establishmentDate ? new Date(`${String(establishmentDate).slice(0, 10)}T00:00:00.000Z`) : null;
    const expected = expectedOperationalDate ? new Date(`${String(expectedOperationalDate).slice(0, 10)}T00:00:00.000Z`) : null;
    if (establishment && Number.isNaN(establishment.getTime())) {
      return NextResponse.json({ error: 'Invalid establishment date' }, { status: 400 });
    }
    if (expected && Number.isNaN(expected.getTime())) {
      return NextResponse.json({ error: 'Invalid expected fully-operational date' }, { status: 400 });
    }
    if (establishment && expected && expected < establishment) {
      return NextResponse.json(
        { error: 'Expected fully-operational date must be on or after the establishment date' },
        { status: 400 }
      );
    }

    // validate inline targets before creating anything
    const rawTargets: Array<Record<string, unknown>> = Array.isArray(targets) ? targets : [];
    const cleanTargets: {
      metric: string;
      unit: string | null;
      targetValue: number;
      periodType: string;
      dueDate: Date | null;
    }[] = [];
    for (const t of rawTargets) {
      const metric = String(t.metric ?? '').trim();
      const value = Number(t.targetValue);
      if (!metric) {
        return NextResponse.json({ error: 'Every target needs a metric name' }, { status: 400 });
      }
      if (!Number.isFinite(value) || value <= 0) {
        return NextResponse.json({ error: `Target "${metric}" needs a target value greater than 0` }, { status: 400 });
      }
      const periodType = String(t.periodType ?? 'total');
      const dueDate = t.dueDate ? new Date(`${String(t.dueDate).slice(0, 10)}T00:00:00.000Z`) : null;
      if (dueDate && Number.isNaN(dueDate.getTime())) {
        return NextResponse.json({ error: `Target "${metric}" has an invalid due date` }, { status: 400 });
      }
      cleanTargets.push({
        metric,
        unit: t.unit ? String(t.unit).trim() || null : null,
        targetValue: value,
        periodType,
        dueDate,
      });
    }

    const created = await db.initiative.create({
      data: {
        name: String(name).trim(),
        description: description ? String(description) : null,
        category: String(category),
        departmentId,
        subCity: String(subCity),
        area: area ? String(area) : null,
        establishmentDate: establishment,
        expectedOperationalDate: expected,
        location: location ? String(location) : null,
        contactName: contactName ? String(contactName) : null,
        contactPhone: contactPhone ? String(contactPhone) : null,
        surveyorName: user.name || user.username || null,
        surveyorId: user.id,
        targets: { create: cleanTargets },
      },
      include: { targets: true, department: { select: { name: true } } },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating initiative:', error);
    return NextResponse.json(
      { error: 'Failed to create initiative', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
