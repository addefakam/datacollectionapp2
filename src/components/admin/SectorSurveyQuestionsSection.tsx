'use client';

/**
 * Admin management section for a module's survey questionnaire — the generic
 * counterpart of the Industry questionnaire editor. Shared by each module's
 * "Manage" workspace (page.tsx) and Administration → Settings → Survey
 * (SettingsManager).
 *
 * Everything the survey form asks can be managed from here:
 *  - modify existing questions (bilingual labels, shown / required flags,
 *    per-step order, and for admin-added questions the input type + choices)
 *  - add new custom questions per wizard step (text, number, paragraph,
 *    dropdown, yes/no) — answers are stored on each record and appear in
 *    Records, the review step and the exports
 *  - remove admin-added custom questions (core identification questions stay)
 *
 * SurveyQuestionsSection: the survey questionnaire. The module's survey form,
 * its step validation, the review list and the server-side POST validation
 * follow this questionnaire immediately.
 */

import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  CUSTOM_SURVEY_INPUTS,
  SURVEY_SECTORS,
  isSurveySectorId,
  makeCustomSurveyKey,
  sectorSurveyFieldDef,
  sectorSurveyFieldsDefault,
  type CustomSurveyInput,
  type SurveyFieldConfig,
  type SurveySectorId,
} from '@/lib/survey-fields';

/** Default view when the settings request fails (offline etc.) or the id is bad. */
function fallbackFields(sector: string): SurveyFieldConfig[] {
  if (isSurveySectorId(sector)) return sectorSurveyFieldsDefault(sector);
  return [];
}

interface AddDraft {
  labelEn: string;
  labelOr: string;
  input: CustomSurveyInput;
  optionsText: string;
  required: boolean;
}

const EMPTY_DRAFT: AddDraft = { labelEn: '', labelOr: '', input: 'text', optionsText: '', required: false };

export function SurveyQuestionsSection({ sector }: { sector: string }) {
  const { toast } = useToast();
  const validSector = isSurveySectorId(sector);
  const sectorId: SurveySectorId | null = validSector ? sector : null;
  const meta = sectorId ? SURVEY_SECTORS[sectorId] : null;

  const [fields, setFields] = useState<SurveyFieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2 | 3 | null>(null);
  const [draft, setDraft] = useState<AddDraft>(EMPTY_DRAFT);

  useEffect(() => {
    if (!sectorId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/settings/survey-fields/${sectorId}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (Array.isArray(data.fields) && data.fields.length > 0) {
            setFields(data.fields);
            return;
          }
        }
      } catch {
        // offline — fall back to the registry defaults below
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) setFields(fallbackFields(sectorId));
    })();
    return () => {
      cancelled = true;
    };
  }, [sectorId]);

  if (!validSector || !sectorId || !meta) return null;

  const def = (key: string) => sectorSurveyFieldDef(sectorId, key);
  /** Wizard step of any question — registry fields use the registry, custom ones their own. */
  const stepOf = (f: SurveyFieldConfig) => (f.custom ? (f.step ?? 3) : (def(f.key)?.step ?? 1));
  const steps = [1, 2, 3] as const;

  /** Move a question up/down within its own wizard step. */
  const move = (key: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.key === key);
    if (idx < 0) return;
    const step = stepOf(fields[idx]);
    const stepIdxs = fields.map((f, i) => (stepOf(f) === step ? i : -1)).filter((i) => i >= 0);
    const pos = stepIdxs.indexOf(idx);
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= stepIdxs.length) return;
    const target = stepIdxs[targetPos];
    const next = [...fields];
    [next[idx], next[target]] = [next[target], next[idx]];
    setFields(next);
  };

  const update = (key: string, patch: Partial<SurveyFieldConfig>) => {
    setFields((cur) => cur.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  };

  const toggleEnabled = (key: string, enabled: boolean) => {
    const d = def(key);
    update(key, enabled ? { enabled: true } : { enabled: false, required: false });
    // Hidden questions keep a sensible default answer — warn once.
    if (!enabled && d?.input === 'radio-yesno') {
      toast({
        title: 'Question hidden / Gaaffii dhokatee',
        description: 'Hidden yes/no questions are stored as "No" for new records / Gaaffii dhokame "Lakki" jedhamuun galmeefama',
      });
    } else if (!enabled && d?.input === 'status-select') {
      toast({
        title: 'Question hidden / Gaaffii dhokatee',
        description: 'Hidden status questions store the default status (Registered) / Sadarkaa dhokame durtiin galmeefama',
      });
    } else if (!enabled && d == null) {
      toast({
        title: 'Question hidden / Gaaffii dhokatee',
        description: 'Hidden custom questions are not collected for new records / Gaaffii dhokame hin kuufamu',
      });
    }
  };

  const removeCustom = (key: string) => {
    setFields((cur) => cur.filter((f) => f.key !== key));
  };

  const draftOptions = () =>
    draft.optionsText
      .split('\n')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

  const draftValid =
    draft.labelEn.trim().length > 0 && (draft.input !== 'select' || draftOptions().length >= 2);

  /** Appends the new custom question at the end of the chosen wizard step. */
  const addQuestion = () => {
    if (!addStep || !draftValid) return;
    const labelEn = draft.labelEn.trim().slice(0, 120);
    const key = makeCustomSurveyKey(labelEn, fields.map((f) => f.key));
    const newField: SurveyFieldConfig = {
      key,
      labelEn,
      labelOr: draft.labelOr.trim().slice(0, 120),
      enabled: true,
      required: draft.required,
      custom: true,
      step: addStep,
      input: draft.input,
      ...(draft.input === 'select' ? { options: draftOptions() } : {}),
    };
    const stepIdxs = fields.map((f, i) => (stepOf(f) === addStep ? i : -1)).filter((i) => i >= 0);
    const next = [...fields];
    if (stepIdxs.length > 0) {
      next.splice(stepIdxs[stepIdxs.length - 1] + 1, 0, newField);
    } else {
      next.push(newField);
    }
    setFields(next);
    setAddStep(null);
    setDraft(EMPTY_DRAFT);
    toast({
      title: 'Question added / Gaaffii dabalame',
      description: 'Press Save to apply it to the survey form / Save tuqeen foonkii irratti hojjeta',
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/survey-fields/${sectorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      if (Array.isArray(data.fields)) setFields(data.fields);
      toast({ title: 'Saved / Olmaa', description: 'Survey questionnaire updated — the form follows it immediately' });
    } catch (e) {
      toast({
        title: 'Save Failed / Hin Olmaa’ne',
        description: e instanceof Error ? e.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset to the default questions? Custom questions you added will be removed.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/survey-fields/${sectorId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to reset');
      if (Array.isArray(data.fields)) setFields(data.fields);
      toast({ title: 'Reset / Deebii', description: 'Questionnaire restored to the default questions' });
    } catch (e) {
      toast({
        title: 'Reset Failed / Hin Deebi’ne',
        description: e instanceof Error ? e.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-survey-questions={sectorId}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-teal-600" />
          Survey Questions — {meta.label} / Gaaffii Safiisaa
        </CardTitle>
        <CardDescription className="text-xs">
          Manage the {meta.label} questionnaire from here: modify the existing questions (labels,
          shown / required flags, order, and for added questions the input type and choices), add
          new questions to any step, or remove added ones. Core identification questions (name,
          type, location, headline count, contact) cannot be removed. The survey form, its
          validation, the Records dialogs and the server follow this questionnaire immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step) => {
          const stepFields = fields.filter((f) => stepOf(f) === step);
          return (
            <div key={step} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {meta.stepTitles[step]}
              </p>
              <div className="overflow-hidden rounded-lg border">
                {stepFields.length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">No questions on this step yet.</p>
                )}
                {stepFields.map((f, i) => {
                  const d = def(f.key);
                  const isCustom = !!f.custom;
                  const requiredLockable = isCustom
                    ? f.enabled && f.input !== 'radio-yesno'
                    : !!d && !d.requiredFixed && f.enabled && d.input !== 'radio-yesno';
                  return (
                    <div
                      key={f.key}
                      data-field-key={f.key}
                      className={`flex flex-col gap-2 p-2.5 sm:flex-row sm:items-start ${i > 0 ? 'border-t' : ''} ${f.enabled ? '' : 'bg-muted/40'}`}
                    >
                      {/* Order controls */}
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => move(f.key, -1)}
                          disabled={i === 0}
                          className="rounded border p-1 text-muted-foreground disabled:opacity-30 hover:bg-teal-50 hover:text-teal-700"
                          title="Move up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(f.key, 1)}
                          disabled={i === stepFields.length - 1}
                          className="rounded border p-1 text-muted-foreground disabled:opacity-30 hover:bg-teal-50 hover:text-teal-700"
                          title="Move down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {/* Labels + custom question config */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Input
                          value={f.labelEn}
                          onChange={(e) => update(f.key, { labelEn: e.target.value })}
                          className="h-8 text-xs sm:text-sm"
                          placeholder={d?.labelEn ?? 'Question label'}
                        />
                        <Input
                          value={f.labelOr}
                          onChange={(e) => update(f.key, { labelOr: e.target.value })}
                          className="h-7 border-dashed text-[11px] text-muted-foreground sm:text-xs"
                          placeholder={d?.labelOr ?? 'Afaan Oromoo label'}
                        />
                        {isCustom && (
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                            <p className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Answer type
                            </p>
                            <Select
                              value={f.input ?? 'text'}
                              onValueChange={(v) =>
                                update(f.key, {
                                  input: v as CustomSurveyInput,
                                  ...(v === 'select' && !(f.options ?? []).length ? { options: ['Option 1', 'Option 2'] } : {}),
                                })
                              }
                            >
                              <SelectTrigger className="h-7 w-full text-[11px] sm:w-56"><SelectValue /></SelectTrigger>
                              <SelectContent className="max-h-64">
                                {CUSTOM_SURVEY_INPUTS.map((t) => (
                                  <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {isCustom && f.input === 'select' && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Choices (one per line, 2-30)
                            </p>
                            <Textarea
                              value={(f.options ?? []).join('\n')}
                              onChange={(e) =>
                                update(f.key, {
                                  options: e.target.value.split('\n').map((o) => o.trim().slice(0, 80)).filter((o) => o.length > 0),
                                })
                              }
                              rows={Math.min(Math.max((f.options ?? []).length, 2), 6)}
                              className="text-[11px]"
                            />
                          </div>
                        )}
                      </div>
                      {/* Flags */}
                      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                        {d?.locked ? (
                          <Badge className="bg-teal-100 text-[10px] text-teal-700">Core</Badge>
                        ) : (
                          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Switch
                              checked={f.enabled}
                              onCheckedChange={(v) => toggleEnabled(f.key, v)}
                              className="data-[state=checked]:bg-teal-600"
                            />
                            Shown
                          </label>
                        )}
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Switch
                            checked={f.required}
                            disabled={!requiredLockable}
                            onCheckedChange={(v) => update(f.key, { required: v })}
                            className="data-[state=checked]:bg-amber-500"
                          />
                          Required
                        </label>
                        {isCustom && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => removeCustom(f.key)}
                            className="h-7 w-7 border-red-200 text-red-500 hover:bg-red-50"
                            title="Remove question"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Add a question to this step */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(EMPTY_DRAFT);
                  setAddStep(step);
                }}
                className="h-7 border-dashed text-[11px] text-teal-700 hover:bg-teal-50"
              >
                <Plus className="mr-1 h-3 w-3" />
                Add question
              </Button>
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save / Olmaa
          </Button>
          <Button variant="outline" onClick={reset} disabled={saving}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to Default / Deebi’a
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Changes apply when you press Save — hidden questions store empty/default values for new
            records / Dhuunfaa Save booda hojjeta
          </p>
        </div>
      </CardContent>

      {/* Add-question dialog */}
      <Dialog open={addStep != null} onOpenChange={(open) => (open ? null : setAddStep(null))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Add question / Gaaffii Dabaluu</DialogTitle>
            <DialogDescription className="text-xs">
              {addStep ? meta.stepTitles[addStep] : ''} — the question appears on this step of the
              survey form right after you press Save.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Question (English) <span className="text-red-500">*</span></Label>
              <Input
                value={draft.labelEn}
                onChange={(e) => setDraft({ ...draft, labelEn: e.target.value })}
                placeholder="e.g., Water access on premises"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Gaaffii (Afaan Oromoo)</Label>
              <Input
                value={draft.labelOr}
                onChange={(e) => setDraft({ ...draft, labelOr: e.target.value })}
                placeholder="Fakkeenya: Paanee keessatti banyii dhaabbee"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Answer type</Label>
              <Select
                value={draft.input}
                onValueChange={(v) => setDraft({ ...draft, input: v as CustomSurveyInput })}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {CUSTOM_SURVEY_INPUTS.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.input === 'select' && (
              <div className="space-y-1">
                <Label className="text-xs">Choices (one per line, 2-30)</Label>
                <Textarea
                  value={draft.optionsText}
                  onChange={(e) => setDraft({ ...draft, optionsText: e.target.value })}
                  placeholder={'Yes / Eyee\nNo / Lakki'}
                  rows={4}
                  className="text-xs"
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={draft.required}
                onCheckedChange={(v) => setDraft({ ...draft, required: v })}
                disabled={draft.input === 'radio-yesno'}
                className="data-[state=checked]:bg-amber-500"
              />
              Required — must be filled before submitting
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStep(null)} className="h-8 text-sm">Cancel</Button>
            <Button onClick={addQuestion} disabled={!draftValid} className="h-8 bg-teal-600 text-sm text-white hover:bg-teal-700">
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
