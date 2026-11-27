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
import { Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SurveyFieldConfig, SurveySectorId } from '@/lib/survey-fields';
import {
  QuestionCard,
  SegmentedYesNo,
  surveyInputClass,
  surveySelectClass,
} from '@/components/shared/survey-ui';

const CUSTOM_INPUT_TITLES: Record<string, string> = {
  text: 'Short answer',
  number: 'Number',
  textarea: 'Paragraph',
  select: 'Choice list',
  'radio-yesno': 'Yes / No',
};

/** Small quiet chip naming the answer type of an admin-added question. */
function AnswerTypeBadge({ input }: { input: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-teal-700 ring-1 ring-teal-600/15">
      <Sparkles className="h-2.5 w-2.5" />
      {CUSTOM_INPUT_TITLES[input] ?? 'Custom'}
    </span>
  );
}

/**
 * Input control of one custom question, styled with the elegant survey kit.
 * Label-less — the caller renders the bilingual label (QuestionCard or
 * CustomQuestionLabel).
 */
export function CustomQuestionControl({
  field,
  value,
  onChange,
  id,
}: {
  field: SurveyFieldConfig;
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  if (field.input === 'textarea') {
    return (
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="rounded-xl border-emerald-900/10 bg-white text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-600/50 focus-visible:ring-emerald-600/20 sm:text-base"
      />
    );
  }
  if (field.input === 'select') {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={surveySelectClass}>
          <SelectValue placeholder="Select / Filadhu" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {(field.options ?? []).map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.input === 'radio-yesno') {
    return <SegmentedYesNo id={id} value={value} onChange={onChange} />;
  }
  return (
    <Input
      id={id}
      type={field.input === 'number' ? 'number' : 'text'}
      min={field.input === 'number' ? '0' : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={surveyInputClass}
    />
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
    <div key={field.key} data-custom-key={field.key}>
      <QuestionCard
        en={field.labelEn}
        or={field.labelOr}
        required={field.required}
        badge={field.input ? <AnswerTypeBadge input={field.input} /> : undefined}
      >
        <CustomQuestionControl field={field} value={value} onChange={onChange} id={id} />
      </QuestionCard>
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
    <div data-slot="survey-custom-view">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500" />
        <h4 className="text-xs font-bold uppercase tracking-wide text-teal-700">
          Additional Questions / Gaaffii Dabalataa
        </h4>
      </div>
      <div className="overflow-hidden rounded-xl border border-emerald-900/[0.08] bg-white">
        {fields.map((f, i) => (
          <div
            key={f.key}
            data-custom-key={f.key}
            className={`flex items-center justify-between gap-2 px-3 py-2.5 ${i > 0 ? 'border-t border-emerald-900/[0.06]' : ''}`}
          >
            <span className="text-xs text-slate-500">
              {f.labelEn}
              {f.labelOr ? <span className="text-slate-400"> · {f.labelOr}</span> : null}
            </span>
            <span className="text-right text-sm font-semibold text-slate-800">{answers?.[f.key] || '-'}</span>
          </div>
        ))}
        {orphans.map(([k, v], i) => (
          <div
            key={k}
            className={`flex items-center justify-between gap-2 px-3 py-2.5 ${fields.length + i > 0 ? 'border-t border-emerald-900/[0.06]' : ''}`}
          >
            <span className="text-xs text-slate-400">{k}</span>
            <span className="text-right text-sm font-semibold text-slate-800">{v || '-'}</span>
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
    <div className="space-y-3" data-slot="survey-custom-edit">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-700">
        Additional Questions / Gaaffii Dabalataa
      </p>
      {fields.map((f) => {
        const id = `edit-custom-${f.key}`;
        const val = value[f.key] ?? '';
        return (
          <div key={f.key} data-custom-key={f.key} className="space-y-1.5">
            <Label htmlFor={id} className="text-xs font-medium text-slate-700">
              {f.labelEn}
              {f.labelOr ? <span className="font-normal text-slate-400"> · {f.labelOr}</span> : ''}
              {f.required ? <span className="ml-0.5 text-rose-500">*</span> : null}
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
    </div>
  );
}
