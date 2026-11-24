import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';

/**
 * Standard sub-city offices — seeded on first GET so the module is usable
 * immediately. Ethiopian urban administration structure.
 */
const DEFAULT_DEPARTMENTS: { name: string; description: string }[] = [
  { name: 'Office of the Sub-City Administrator', description: 'Overall coordination and follow-up of sub-city initiatives' },
  { name: 'Health Office', description: 'Public health facilities, services and campaigns' },
  { name: 'Education Office', description: 'Schools, kindergartens and education quality' },
  { name: 'Agriculture Office', description: 'Urban agriculture, livestock and food security' },
  { name: 'Water & Energy Office', description: 'Water supply, sanitation and energy access' },
  { name: 'Job Creation & Enterprise Development Office', description: 'MSE development, employment and livelihoods' },
  { name: 'Trade & Market Development Office', description: 'Markets, trade licensing and consumer protection' },
  { name: 'Urban Development & Construction Office', description: 'Infrastructure, roads, housing and construction' },
  { name: 'Land Administration Office', description: 'Land allocation, permits and tenure' },
  { name: 'Environment Protection Office', description: 'Green areas, waste management and pollution control' },
  { name: 'Women & Youth Affairs Office', description: 'Women and youth participation and benefits' },
  { name: 'Social & Labor Affairs Office', description: 'Social protection, labor affairs and disability support' },
  { name: 'Finance & Economic Development Office', description: 'Budget, finance and economic planning' },
];

// GET /api/departments — list responsible departments (seeds defaults once)
export async function GET() {
  try {
    let departments = await db.department.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    if (departments.length === 0) {
      await db.department.createMany({
        data: DEFAULT_DEPARTMENTS.map((d, i) => ({ ...d, sortOrder: i })),
      });
      departments = await db.department.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    }

    return NextResponse.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 });
  }
}

// POST /api/departments — add a department (admin)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { name, description } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Department name is required' }, { status: 400 });
    }

    const exists = await db.department.findUnique({ where: { name: String(name).trim() } });
    if (exists) {
      return NextResponse.json({ error: 'A department with this name already exists' }, { status: 409 });
    }

    const maxSort = await db.department.aggregate({ _max: { sortOrder: true } });
    const department = await db.department.create({
      data: {
        name: String(name).trim(),
        description: description ? String(description) : null,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json(department, { status: 201 });
  } catch (error) {
    console.error('Error creating department:', error);
    return NextResponse.json({ error: 'Failed to create department' }, { status: 500 });
  }
}
