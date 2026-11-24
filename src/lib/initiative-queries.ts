import { db } from '@/lib/db';
import {
  analyzeInitiative,
  summarizeGroup,
  type GroupPerformance,
  type InitiativeAnalysis,
  type ReportDTO,
  type TargetDTO,
} from '@/lib/initiative-monitor';

/**
 * Server-side loaders for the Performance Monitoring module — fetch the
 * Prisma rows, serialize them and run the shared analysis engine.
 */

export type AnalyzedInitiative = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  departmentId: string;
  departmentName: string;
  subCity: string;
  area: string | null;
  status: string;
  establishmentDate: string | null;
  expectedOperationalDate: string | null;
  operationalDate: string | null;
  location: string | null;
  contactName: string | null;
  contactPhone: string | null;
  surveyorName: string | null;
  createdAt: string;
  updatedAt: string;
  targets: TargetDTO[];
  reports: ReportDTO[];
  analysis: InitiativeAnalysis;
};

/** Load initiatives (+targets, +reports) matching a where clause, analyzed. */
export async function loadAnalyzedInitiatives(where: Record<string, unknown> = {}): Promise<AnalyzedInitiative[]> {
  const rows = await db.initiative.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      department: { select: { name: true } },
      targets: { orderBy: { createdAt: 'asc' } },
      dailyReports: { orderBy: { reportDate: 'desc' } },
    },
  });

  return rows.map((r) => {
    const targets: TargetDTO[] = r.targets.map((t) => ({
      id: t.id,
      metric: t.metric,
      unit: t.unit,
      targetValue: t.targetValue,
      periodType: t.periodType,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      status: t.status,
    }));
    const reports: ReportDTO[] = r.dailyReports.map((rep) => ({
      id: rep.id,
      targetId: rep.targetId,
      reportDate: rep.reportDate.toISOString(),
      activities: rep.activities,
      achievedValue: rep.achievedValue,
      challenges: rep.challenges,
      supportNeeded: rep.supportNeeded,
      reportedByName: rep.reportedByName,
      createdAt: rep.createdAt.toISOString(),
    }));
    const analysis = analyzeInitiative(
      {
        status: r.status,
        establishmentDate: r.establishmentDate ? r.establishmentDate.toISOString() : null,
        expectedOperationalDate: r.expectedOperationalDate ? r.expectedOperationalDate.toISOString() : null,
        operationalDate: r.operationalDate ? r.operationalDate.toISOString() : null,
      },
      targets,
      reports
    );
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category,
      departmentId: r.departmentId,
      departmentName: r.department.name,
      subCity: r.subCity,
      area: r.area,
      status: r.status,
      establishmentDate: r.establishmentDate ? r.establishmentDate.toISOString() : null,
      expectedOperationalDate: r.expectedOperationalDate ? r.expectedOperationalDate.toISOString() : null,
      operationalDate: r.operationalDate ? r.operationalDate.toISOString() : null,
      location: r.location,
      contactName: r.contactName,
      contactPhone: r.contactPhone,
      surveyorName: r.surveyorName,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      targets,
      reports,
      analysis,
    };
  });
}

/** Per-department performance rows for the dashboard. */
export function departmentPerformance(items: AnalyzedInitiative[]): (GroupPerformance & { departmentId: string })[] {
  const byDept = new Map<string, AnalyzedInitiative[]>();
  for (const i of items) {
    const arr = byDept.get(i.departmentName) ?? [];
    arr.push(i);
    byDept.set(i.departmentName, arr);
  }
  return [...byDept.entries()]
    .map(([name, arr]) => ({
      departmentId: arr[0].departmentId,
      ...summarizeGroup(
        name,
        arr.map((i) => ({ status: i.status, analysis: i.analysis }))
      ),
    }))
    .sort((a, b) => b.initiatives - a.initiatives);
}

/** Per-sub-city performance rows. */
export function subCityPerformance(items: AnalyzedInitiative[]): GroupPerformance[] {
  const byCity = new Map<string, AnalyzedInitiative[]>();
  for (const i of items) {
    const arr = byCity.get(i.subCity || 'Unspecified') ?? [];
    arr.push(i);
    byCity.set(i.subCity || 'Unspecified', arr);
  }
  return [...byCity.entries()]
    .map(([name, arr]) =>
      summarizeGroup(
        name,
        arr.map((i) => ({ status: i.status, analysis: i.analysis }))
      )
    )
    .sort((a, b) => b.initiatives - a.initiatives);
}
