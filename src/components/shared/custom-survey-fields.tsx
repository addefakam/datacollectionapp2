'use client';

/**
 * Shared rendering / validation helpers for admin-added custom survey
 * questions ("custom_*" keys). Used by every module survey form (Hotel &
 * Guest House, Health, Education, Agriculture — Small Enterprise predates it)
 * and by the Records dialogs so a question added in Administration → Settings
 * → Survey behaves identically everywhere.
 *
 * The questionnaire itself lives in src/lib/survey-fields.ts; the editor UI is
 * src/components/admin/SectorSurveyQuestionsSection.tsx (and the SME Manage
 * manager).
 */

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SurveyFieldConfig, SurveySectorId } from '@/lib/survey-fields';

/** Bilingual label of one custom question with the required star. */
export function CustomQuestionLabel({
  id,
  field,
}: {
  id: string;
  field: SurveyFieldConfig;
}) {
  return (
    <Label htmlFor={id} className="text-xs sm:text-sm">
      {field.labelEn}
      {field.labelOr ? (
        <>
          <br />
          <span className="text-xs font-normal text-muted-foreground">{field.labelOr}</span>
        </>
      ) : null}
      {field.required ? <span className="text-red-500"> *</span> : null}
    </Label>
  );
}

/**
 * Renders one admin-added custom question by input type. Controlled — pass the
 * current string answer and an onChange setter.
 */
export function CustomQuestionField({
  field,
  value,
  onChange,
  idPrefix,
}: {
  field: SurveyFieldConfig;
  value: string;
  onChange: (v: string) => void;
  idPrefix: string;
}) {
  const id = `${idPrefix}-${field.key}`;
  return (
    <div key={field.key} data-custom-key={field.key} className="space-y-1.5 sm:space-y-2">
      <CustomQuestionLabel id={id} field={field} />
      {field.input === 'textarea' ? (
        <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="text-sm sm:text-base" />
      ) : field.input === 'select' ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className="text-sm sm:text-base"><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
          <SelectContent className="max-h-64">
            {(field.options ?? []).map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
          </SelectContent>
        </Select>
      ) : field.input === 'radio-yesno' ? (
        <RadioGroup value={value} onValueChange={onChange} className="flex gap-4">
          <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-amber-500 has-data-[state=checked]:bg-amber-50">
            <RadioGroupItem value="yes" id={`${id}-yes`} />
            <Label htmlFor={`${id}-yes`} className="cursor-pointer text-xs sm:text-sm">Yes / Eyee</Label>
          </div>
          <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-amber-500 has-data-[state=checked]:bg-amber-50">
            <RadioGroupItem value="no" id={`${id}-no`} />
            <Label htmlFor={`${id}-no`} className="cursor-pointer text-xs sm:text-sm">No / Lakki</Label>
          </div>
        </RadioGroup>
      ) : (
        <Input
          id={id}
          type={field.input === 'number' ? 'number' : 'text'}
          min={field.input === 'number' ? '0' : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm sm:text-base"
        />
      )}
    </div>
  );
}

export interface CustomStepIssue {
  kind: 'missing' | 'invalid';
  /** English question label, ready for a toast description. */
  message: string;
}

/**
 * First missing required answer / invalid number among the enabled custom
 * questions of one wizard step; null when the step answers are acceptable.
 */
export function customStepIssue(
  fields: SurveyFieldConfig[],
  answers: Record<string, string>,
  step: number
): CustomStepIssue | null {
  for (const f of fields) {
    if (!f.custom || !f.enabled || (f.step ?? 3) !== step) continue;
    const v = (answers[f.key] ?? '').trim();
    if (f.required && !v) {
      return { kind: 'missing', message: `Required: ${f.labelEn} / Barbaachisaadha` };
    }
    if (v && f.input === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        return { kind: 'invalid', message: `${f.labelEn} must be a non-negative number` };
      }
    }
  }
  return null;
}

/** Wizard step of a questionnaire entry — custom ones carry their own step. */
export function customQuestionStep(f: SurveyFieldConfig): 1 | 2 | 3 {
  return f.step ?? 3;
}

/** Enabled custom questions of one wizard step, in saved order. */
export function customQuestionsForStep(
  fields: SurveyFieldConfig[],
  step: number
): SurveyFieldConfig[] {
  return fields.filter((f) => f.custom && f.enabled && customQuestionStep(f) === step);
}

/**
 * Review-step rows for all enabled custom questions (missing answers show a
 * dash), appended after the module's own review rows.
 */
export function customReviewRows(
  fields: SurveyFieldConfig[],
  answers: Record<string, string>
): { label: string; value: string }[] {
  return fields
    .filter((f) => f.custom && f.enabled)
    .map((f) => ({
      label: `${f.labelEn}${f.labelOr ? ' / ' + f.labelOr : ''}`,
      value: answers[f.key] || '—',
    }));
}

/**
 * Loads the currently enabled custom questions of one sector for the Records
 * dialogs. Empty while loading / offline — the dialogs simply show no extra
 * questions.
 */
export function useCustomSurveyQuestions(sector: SurveySectorId): SurveyFieldConfig[] {
  const [customQs, setCustomQs] = useState<SurveyFieldConfig[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/survey-fields/${sector}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unavailable'))))
      .then((d) => {
        if (!cancelled && Array.isArray(d.fields)) {
          setCustomQs(d.fields.filter((f: SurveyFieldConfig) => f.custom && f.enabled));
        }
      })
      .catch(() => {
        // offline / unavailable — dialogs simply show no custom questions
      });
    return () => {
      cancelled = true;
    };
  }, [sector]);
  return customQs;
}

/** View-dialog block listing every custom question and the stored answer. */
export function CustomQuestionViewRows({
  fields,
  answers,
}: {
  fields: SurveyFieldConfig[];
  answers?: Record<string, string> | null;
}) {
  if (fields.length === 0) return null;
  // Answers of questions that were removed from the questionnaire afterwards
  // still deserve a row so no collected data disappears silently.
  const orphans = Object.entries(answers ?? {}).filter(([k]) => !fields.some((f) => f.key === k));
  if (fields.length === 0 && orphans.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className="h-1 w-1 rounded-full bg-teal-500" />
        <h4 className="text-xs font-bold text-teal-700 uppercase tracking-wide">
          Additional Questions / Gaaffii Dabalataa
        </h4>
      </div>
      <div className="rounded-lg border space-y-0 divide-y">
        {fields.map((f) => (
          <div key={f.key} data-custom-key={f.key} className="flex items-center justify-between gap-2 px-3 py-2.5">
            <span className="text-xs text-muted-foreground">{f.labelEn}</span>
            <span className="text-sm font-semibold text-right">{answers?.[f.key] || '-'}</span>
          </div>
        ))}
        {orphans.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-2 px-3 py-2.5">
            <span className="text-xs text-muted-foreground">{k}</span>
            <span className="text-sm font-semibold text-right">{v || '-'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Edit-dialog inputs for the custom questions — controlled by the caller so
 * the answers ride along with the regular save payload.
 */
export function CustomQuestionEditFields({
  fields,
  value,
  onChange,
}: {
  fields: SurveyFieldConfig[];
  value: Record<string, string>;
  onChange: (answers: Record<string, string>) => void;
}) {
  if (fields.length === 0) return null;
  const set = (key: string, v: string) => onChange({ ...value, [key]: v });
  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-900/60">
        Additional Questions / Gaaffii Dabalataa
      </p>
      {fields.map((f) => {
        const id = `edit-custom-${f.key}`;
        const val = value[f.key] ?? '';
        return (
          <div key={f.key} data-custom-key={f.key} className="space-y-1.5">
            <Label htmlFor={id} className="text-xs">
              {f.labelEn}
              {f.labelOr ? ` / ${f.labelOr}` : ''}
              {f.required ? <span className="text-red-500"> *</span> : null}
            </Label>
            {f.input === 'textarea' ? (
              <Textarea id={id} rows={2} value={val} onChange={(e) => set(f.key, e.target.value)} className="text-sm" />
            ) : f.input === 'select' ? (
              <Select value={val} onValueChange={(v) => set(f.key, v)}>
                <SelectTrigger id={id} className="text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {(f.options ?? []).map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                </SelectContent>
              </Select>
            ) : f.input === 'radio-yesno' ? (
              <Select value={val} onValueChange={(v) => set(f.key, v)}>
                <SelectTrigger id={id} className="text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes / Eyee</SelectItem>
                  <SelectItem value="no">No / Lakki</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={id}
                type={f.input === 'number' ? 'number' : 'text'}
                min={f.input === 'number' ? '0' : undefined}
                value={val}
                onChange={(e) => set(f.key, e.target.value)}
                className="text-sm"
              />
            )}
          </div>
        );
      })}
    </>
  );
}
