'use client';

/**
 * Elegant, professional presentation kit for the survey data-collection
 * wizards — the shared design language for every module's survey form
 * (Hotel & Guest House, Health, Education, Agriculture, Small Enterprise,
 * Industry, Initiative).
 *
 * Pure presentation only: validation, state and payloads stay inside each
 * form. Building blocks:
 *  - SurveyProgress       — wizard step header (icon pills + gradient track)
 *  - SurveySectionHeader  — step card header (icon chip + bilingual title)
 *  - SurveyFieldLabel     — compact bilingual question label (EN + Afaan Oromoo)
 *  - QuestionCard         — soft card wrapper for admin-added questions
 *  - SegmentedYesNo       — Typeform-style Yes/No segmented control
 *  - SurveyReviewTable    — review-step summary rows
 *  - SurveyNav            — back / next / submit footer
 *  - surveyInputClass / surveySelectClass — consistent input chrome
 */

import * as React from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Shared input chrome — every survey field uses the same quiet,       */
/* refined look: generous height, rounded-xl, emerald focus ring.      */
/* ------------------------------------------------------------------ */

export const surveyInputClass =
  'h-11 rounded-xl border-emerald-900/10 bg-white text-sm shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-emerald-600/50 focus-visible:ring-emerald-600/20 sm:text-base';

export const surveySelectClass =
  'h-11 rounded-xl border-emerald-900/10 bg-white text-sm shadow-none data-[placeholder]:text-slate-400 focus-visible:border-emerald-600/50 focus-visible:ring-emerald-600/20 sm:text-base';

/* ------------------------------------------------------------------ */
/* SurveyProgress — the wizard header. Icon pills joined by a soft     */
/* track that fills with an emerald gradient as the collector advances. */
/* Completed steps are clickable; the active step glows; upcoming      */
/* steps stay quiet. Bilingual: EN title + Afaan Oromoo sub-title.     */
/* ------------------------------------------------------------------ */

export interface SurveyStepDef {
  id: number;
  title: string;
  titleOr: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function SurveyProgress({
  steps,
  current,
  onStepClick,
  actions,
}: {
  steps: SurveyStepDef[];
  /** 1-based active step. */
  current: number;
  /** Fire when a completed step pill is clicked (undefined → not clickable). */
  onStepClick?: (id: number) => void;
  /** Optional right-side actions (e.g. Reset) rendered under the pills. */
  actions?: React.ReactNode;
}) {
  const pct = Math.round(((current - 1) / Math.max(steps.length - 1, 1)) * 100);
  return (
    <div
      data-slot="survey-progress"
      className="rounded-2xl border border-emerald-900/[0.08] bg-white px-3 py-3 shadow-[0_1px_2px_rgba(7,45,38,0.05),0_14px_36px_-24px_rgba(7,45,38,0.22)] sm:px-5 sm:py-4"
    >
      <div className="flex items-start gap-0.5 sm:gap-1.5">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isActive = current === step.id;
          const isDone = current > step.id;
          const clickable = isDone && !!onStepClick;
          return (
            <React.Fragment key={step.id}>
              <button
                type="button"
                onClick={clickable ? () => onStepClick?.(step.id) : undefined}
                disabled={!clickable}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 outline-none transition-all sm:flex-none sm:gap-1 sm:rounded-xl sm:px-3',
                  isActive &&
                    'bg-gradient-to-b from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25',
                  isDone && !isActive && 'bg-emerald-50 text-emerald-700',
                  !isActive && !isDone && 'text-slate-400',
                  clickable && 'cursor-pointer hover:bg-emerald-100/70',
                  !clickable && 'cursor-default'
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full ring-2 transition-all sm:h-8 sm:w-8',
                    isActive && 'bg-white/20 text-white ring-white/40',
                    isDone && !isActive && 'bg-emerald-600 text-white ring-emerald-200',
                    !isActive && !isDone && 'bg-slate-100 text-slate-400 ring-transparent'
                  )}
                >
                  {isDone && !isActive ? (
                    <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  )}
                </span>
                <span
                  className={cn(
                    'w-full truncate text-center text-[9px] font-semibold leading-tight sm:w-auto sm:whitespace-nowrap sm:text-[11px]',
                    !isActive && !isDone && 'font-medium'
                  )}
                >
                  {step.title}
                </span>
                <span
                  className={cn(
                    'hidden w-full truncate text-center text-[9px] leading-tight opacity-80 sm:block sm:w-auto sm:whitespace-nowrap',
                    isActive ? 'text-white/85' : isDone ? 'text-emerald-600/80' : 'text-slate-400/80'
                  )}
                >
                  {step.titleOr}
                </span>
              </button>
              {idx < steps.length - 1 && (
                <div className="flex h-9 flex-1 items-center self-start pt-4 sm:h-10 sm:pt-5">
                  <div
                    className={cn(
                      'h-1 w-full min-w-4 rounded-full transition-all duration-500',
                      current > step.id
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        : 'bg-slate-200/80'
                    )}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-emerald-900/[0.06] pt-2">
        <p className="text-[11px] font-medium text-slate-500 sm:text-xs">
          Step <span className="font-bold text-emerald-700">{current}</span> of {steps.length}
          <span className="mx-1.5 text-slate-300">|</span>
          <span className="hidden sm:inline">Qajeelfannaa {current} kiyya {steps.length} keessaa</span>
          <span className="sm:hidden">Qajeelfannaa {current} kiyya</span>
        </p>
        <div className="flex items-center gap-2.5">
          {actions}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/15 sm:text-[11px]">
            {pct}%
            <span className="h-1.5 w-10 overflow-hidden rounded-full bg-emerald-600/15 sm:w-14">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SurveySectionHeader — step card header: soft icon chip, bilingual   */
/* title (Oromo over EN by convention of the forms), short description.*/
/* ------------------------------------------------------------------ */

const SECTION_TONES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  purple: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/15',
};

export function SurveySectionHeader({
  icon: Icon,
  title,
  subtitle,
  description,
  tone = 'emerald',
}: {
  icon: React.ComponentType<{ className?: string }>;
  /** Main (Afaan Oromoo) title line. */
  title: string;
  /** Secondary (English) title line. */
  subtitle: string;
  description?: string;
  tone?: keyof typeof SECTION_TONES;
}) {
  return (
    <div data-slot="survey-section-header" className="space-y-1">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 sm:h-10 sm:w-10',
            SECTION_TONES[tone]
          )}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold leading-tight text-slate-900 sm:text-lg">
            {title}
            <span className="block text-[13px] font-normal text-slate-500 sm:text-sm">{subtitle}</span>
          </h3>
        </div>
      </div>
      {description ? (
        <p className="pl-[46px] text-xs text-slate-500 sm:pl-[52px] sm:text-[13px]">{description}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SurveyFieldLabel — compact bilingual label used by the core form    */
/* fields: EN primary + Afaan Oromoo secondary + required star.        */
/* ------------------------------------------------------------------ */

export function SurveyFieldLabel({
  id,
  en,
  or,
  required,
}: {
  id: string;
  en: string;
  or?: string;
  required?: boolean;
}) {
  return (
    <Label htmlFor={id} className="text-xs font-medium text-slate-700 sm:text-sm">
      {en}
      {or ? (
        <>
          {' '}
          <span className="font-normal text-slate-400">· {or}</span>
        </>
      ) : null}
      {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
    </Label>
  );
}

/* ------------------------------------------------------------------ */
/* QuestionCard — the soft card that wraps admin-added survey          */
/* questions so they read as a distinct, deliberate part of the form.  */
/* ------------------------------------------------------------------ */

export function QuestionCard({
  en,
  or,
  required,
  badge,
  children,
  className,
}: {
  en: string;
  or?: string;
  required?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="survey-question-card"
      className={cn(
        'relative overflow-hidden rounded-xl border border-emerald-900/[0.08] bg-gradient-to-b from-white to-emerald-50/40 p-3 shadow-none transition-shadow focus-within:border-emerald-600/30 focus-within:shadow-[0_0_0_3px_rgba(5,150,105,0.08)] sm:p-4',
        className
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-500 to-teal-500" />
      <div className="mb-2 flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-snug text-slate-800 sm:text-sm">
            {en}
            {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
          </p>
          {or ? <p className="text-[11px] leading-snug text-slate-400 sm:text-xs">{or}</p> : null}
        </div>
        {badge}
      </div>
      <div className="pl-2">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SegmentedYesNo — a refined Yes/No segmented control (RadioGroup     */
/* under the hood: same `${id}-yes` / `${id}-no` inputs as before).    */
/* ------------------------------------------------------------------ */

export function SegmentedYesNo({
  id,
  value,
  onChange,
  yesLabel = 'Yes',
  yesSub = 'Eyee',
  noLabel = 'No',
  noSub = 'Lakki',
  className,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  yesLabel?: string;
  yesSub?: string;
  noLabel?: string;
  noSub?: string;
  className?: string;
}) {
  const option = (
    key: 'yes' | 'no',
    label: string,
    sub: string,
    Icon: React.ComponentType<{ className?: string }>
  ) => {
    const selected = value === key;
    return (
      <Label
        htmlFor={`${id}-${key}`}
        className={cn(
          'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:gap-2',
          selected
            ? key === 'yes'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
              : 'bg-slate-600 text-white shadow-md shadow-slate-600/20'
            : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
        )}
      >
        <RadioGroupItem id={`${id}-${key}`} value={key} className="peer sr-only" />
        <span
          className={cn(
            'flex h-4.5 w-4.5 items-center justify-center rounded-full ring-1 transition-colors',
            selected
              ? key === 'yes'
                ? 'bg-white/20 text-white ring-white/40'
                : 'bg-white/20 text-white ring-white/40'
              : 'bg-white text-slate-400 ring-slate-300'
          )}
        >
          <Icon className="h-2.5 w-2.5" />
        </span>
        <span className="leading-none">
          {label}
          <span className={cn('ml-1 text-[10px] font-normal', selected ? 'text-white/75' : 'text-slate-400')}>
            {sub}
          </span>
        </span>
      </Label>
    );
  };
  return (
    <RadioGroup
      value={value}
      onValueChange={onChange}
      className={cn(
        'inline-flex w-full items-stretch gap-1 rounded-xl border border-emerald-900/10 bg-slate-50/80 p-1 sm:w-auto sm:min-w-64',
        className
      )}
    >
      {option('yes', yesLabel, yesSub, Check)}
      {option('no', noLabel, noSub, X)}
    </RadioGroup>
  );
}

/* ------------------------------------------------------------------ */
/* SurveyReviewTable — clean summary rows for the review step.         */
/* ------------------------------------------------------------------ */

export function SurveyReviewTable({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <div
      data-slot="survey-review"
      className="overflow-hidden rounded-xl border border-emerald-900/[0.08] bg-white"
    >
      {items.map((item, i) => (
        <div
          key={`${item.label}-${i}`}
          className={cn(
            'flex items-baseline justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-emerald-50/40 sm:px-4',
            i > 0 && 'border-t border-emerald-900/[0.06]'
          )}
        >
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:text-xs">
            {item.label}
          </span>
          <span className="min-w-0 truncate text-right text-xs font-semibold text-slate-800 sm:text-sm">
            {item.value || <span className="font-normal text-slate-300">—</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SurveyNav — the wizard footer: quiet Back, gradient Next / Submit.  */
/* ------------------------------------------------------------------ */

export function SurveyNav({
  current,
  total,
  onBack,
  onNext,
  submitting,
  backLabel = 'Back',
  backSub = "Deebi'uu",
  nextLabel = 'Next',
  nextSub = 'Itti Fufuu',
  submitLabel = 'Submit Survey',
  submitSub = 'Galma Erguu',
}: {
  current: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  submitting?: boolean;
  backLabel?: string;
  backSub?: string;
  nextLabel?: string;
  nextSub?: string;
  submitLabel?: string;
  submitSub?: string;
}) {
  return (
    <div className="mt-3 flex items-stretch gap-2 sm:mt-5 sm:gap-3">
      {current > 1 && (
        <Button
          type="button"
          onClick={onBack}
          className="h-11 flex-1 rounded-xl border-emerald-900/10 bg-white text-xs font-medium text-slate-600 shadow-none hover:bg-slate-50 hover:text-slate-800 sm:flex-none sm:px-6 sm:text-sm"
          variant="outline"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="ml-1">{backLabel}</span>
          <span className="ml-0.5 hidden text-slate-400 sm:inline">· {backSub}</span>
        </Button>
      )}
      {current < total ? (
        <Button
          type="button"
          onClick={onNext}
          className="h-11 flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:from-emerald-700 hover:to-teal-700 hover:shadow-emerald-600/30 sm:flex-none sm:px-8"
        >
          <span>{nextLabel}</span>
          <span className="ml-1 hidden text-white/70 sm:inline">· {nextSub}</span>
          <ChevronRight className="ml-0.5 h-4 w-4" />
        </Button>
      ) : (
        <Button
          type="submit"
          disabled={submitting}
          className="h-11 flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:from-emerald-700 hover:to-teal-700 hover:shadow-emerald-600/30 sm:flex-none sm:px-8"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>Submitting…</span>
            </>
          ) : (
            <>
              <Check className="mr-1.5 h-4 w-4" />
              <span>{submitLabel}</span>
              <span className="ml-1 hidden text-white/70 sm:inline">· {submitSub}</span>
            </>
          )}
        </Button>
      )}
    </div>
  );
}
