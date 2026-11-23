/**
 * Sex-disaggregated people counts (male / female) recorded alongside a total
 * (employees, staff, students, teachers, workers...).
 *
 * Rule: the breakdown is optional. When at least one of the two values is a
 * positive number, both must be non-negative whole numbers and their sum must
 * equal the recorded total. When both are empty/zero the breakdown is simply
 * unknown (stored as 0/0) — this keeps legacy records and imports valid.
 */
export type SexCountsResult =
  | { ok: true; male: number; female: number }
  | { ok: false; error: string };

export function parseSexCounts(
  maleRaw: unknown,
  femaleRaw: unknown,
  total: number,
  entityLabel: string, // e.g. 'Employee Count', 'Staff Count', 'Student Count'
): SexCountsResult {
  const hasMale = maleRaw != null && maleRaw !== '';
  const hasFemale = femaleRaw != null && femaleRaw !== '';
  if (!hasMale && !hasFemale) return { ok: true, male: 0, female: 0 };

  const male = Number(maleRaw ?? 0);
  const female = Number(femaleRaw ?? 0);
  if (!Number.isFinite(male) || !Number.isInteger(male) || male < 0) {
    return { ok: false, error: `Male ${entityLabel} must be a non-negative whole number` };
  }
  if (!Number.isFinite(female) || !Number.isInteger(female) || female < 0) {
    return { ok: false, error: `Female ${entityLabel} must be a non-negative whole number` };
  }

  const sum = male + female;
  if (sum > 0 && sum !== Math.round(total)) {
    return { ok: false, error: `Male + Female (${sum}) must equal ${entityLabel} (${Math.round(total)})` };
  }
  return { ok: true, male, female };
}

/** True when a record carries a usable sex breakdown (used to show M/F chips). */
export function hasSexBreakdown(male: number | undefined | null, female: number | undefined | null): boolean {
  return (male ?? 0) + (female ?? 0) > 0;
}
