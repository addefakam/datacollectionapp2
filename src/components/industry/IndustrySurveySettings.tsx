'use client';

/**
 * Admin management sections for the Industry survey — shared by the Industry
 * "Manage" workspace (page.tsx) and Administration → Settings (SettingsManager).
 *
 * - IndustryQuestionnaireSection: the survey questionnaire — hide/show
 *   questions, required flags, bilingual labels and per-step ordering, and
 *   ADD new custom questions ("Add question" — text / number / paragraph /
 *   dropdown / yes-no) plus remove them again. Answers ride on each record's
 *   customAnswers column; the form, the Records dialogs and the exports all
 *   follow.
 * - IndustryStatsConditionSection: the "Sector Distribution" chart attribution —
 *   which groupings the stats offer and the default one.
 */

import { useEffect, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { STATS_ATTRIBUTES } from '@/lib/stats-attributes';
import {
  SURVEY_FIELDS_DEFAULT,
  industrySurveyFieldDef,
  stepOfIndustryField,
  type IndustrySurveyFieldConfig,
} from '@/lib/industry-survey-fields';
import {
  CUSTOM_SURVEY_INPUTS,
  makeCustomSurveyKey,
  type CustomSurveyInput,
} from '@/lib/survey-fields';

interface AttributeOption {
  key: string;
  label: string;
  description: string;
}

/** Registry fallback used when the settings request fails (offline etc.). */
const DEFAULT_ATTRIBUTE_OPTIONS: AttributeOption[] = STATS_ATTRIBUTES.map((a) => ({
  key: a.key,
  label: a.label,
  description: a.description,
}));

// ============ Industry survey questionnaire section ============

/** Wizard steps of the survey form — questions are managed per step. */
const SURVEY_STEP_TITLES: Record<number, string> = {
  1: 'Step 1 — Establishment / Indastrii',
  2: 'Step 2 — Registration / Galmee fi Safiisaa',
  3: 'Step 3 — Contact / Quunnamtii',
};

interface AddDraft {
  labelEn: string;
  labelOr: string;
  input: CustomSurveyInput;
  optionsText: string;
  required: boolean;
}

const EMPTY_DRAFT: AddDraft = { labelEn: '', labelOr: '', input: 'text', optionsText: '', required: false };

export function IndustryQuestionnaireSection() {
  const { toast } = useToast();
  const [fields, setFields] = useState<IndustrySurveyFieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2 | 3 | null>(null);
  const [draft, setDraft] = useState<AddDraft>(EMPTY_DRAFT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/survey-fields');
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
      if (!cancelled) setFields(SURVEY_FIELDS_DEFAULT.map((f) => ({ ...f })));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const def = (key: string) => industrySurveyFieldDef(key);

  /** Move a question up/down within its own wizard step (custom ones included). */
  const move = (key: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.key === key);
    if (idx < 0) return;
    const step = stepOfIndustryField(fields[idx]);
    // positions of this step's questions inside the flat array
    const stepIdxs = fields
      .map((f, i) => (stepOfIndustryField(f) === step ? i : -1))
      .filter((i) => i >= 0);
    const pos = stepIdxs.indexOf(idx);
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= stepIdxs.length) return;
    const target = stepIdxs[targetPos];
    const next = [...fields];
    [next[idx], next[target]] = [next[target], next[idx]];
    setFields(next);
  };

  const update = (key: string, patch: Partial<IndustrySurveyFieldConfig>) => {
    setFields((cur) => cur.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  };

  const toggleEnabled = (key: string, enabled: boolean) => {
    const d = def(key);
    update(key, enabled ? { enabled: true } : { enabled: false, required: false });
    // Hiding a yes/no question silently stores "no" — warn once.
    if (!enabled && d?.input === 'radio-yesno') {
      toast({
        title: 'Question hidden / Gaaffii dhokatee',
        description: 'Hidden yes/no questions are stored as "No" for new records / Gaaffii dhokame "Lakki" jedhamuun galmeefama',
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
    const newField: IndustrySurveyFieldConfig = {
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
    const stepIdxs = fields
      .map((f, i) => (stepOfIndustryField(f) === addStep ? i : -1))
      .filter((i) => i >= 0);
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
      const res = await fetch('/api/settings/survey-fields', {
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
    setSaving(true);
    try {
      const res = await fetch('/api/settings/survey-fields', { method: 'DELETE' });
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-teal-600" />
          Survey Questions / Gaaffii Safiisaa
        </CardTitle>
        <CardDescription className="text-xs">
          Manage the Industry survey questionnaire: hide questions, change required flags, edit
          labels, reorder them inside their step, and add new questions to any step ("Add
          question" — bilingual label + answer type). Core identification questions (name, sector,
          location, employee count, contact) cannot be removed. The survey form, its validation,
          the Records dialogs, the exports and the server follow this questionnaire immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {([1, 2, 3] as const).map((step) => {
          const stepFields = fields.filter((f) => stepOfIndustryField(f) === step);
          return (
            <div key={step} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {SURVEY_STEP_TITLES[step]}
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
              {/* Add a question to this step — the survey form picks it up after Save */}
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

      {/* Add-question dialog — same flow as the other modules' questionnaire editors */}
      <Dialog open={addStep != null} onOpenChange={(open) => (open ? null : setAddStep(null))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Add question / Gaaffii Dabaluu</DialogTitle>
            <DialogDescription className="text-xs">
              {addStep ? SURVEY_STEP_TITLES[addStep] : ''} — the question appears on this step of
              the survey form right after you press Save.
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

// ============ Sector Distribution attribution section ============

export function IndustryStatsConditionSection() {
  const { toast } = useToast();
  const [attribute, setAttribute] = useState('category');
  const [options, setOptions] = useState<AttributeOption[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/stats-attribute');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setAttribute(data.attribute);
          if (Array.isArray(data.options) && data.options.length > 0) {
            setOptions(data.options);
          }
        }
      } catch {
        // offline — fall back to the registry defaults below
      } finally {
        if (!cancelled) {
          setOptions((cur) => (cur.length > 0 ? cur : DEFAULT_ATTRIBUTE_OPTIONS));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Registry keys not yet enabled — these can be added. */
  const addable = STATS_ATTRIBUTES.filter((a) => !options.some((o) => o.key === a.key));

  const addOption = () => {
    const def = STATS_ATTRIBUTES.find((a) => a.key === newKey);
    if (!def) return;
    setOptions([
      ...options,
      { key: def.key, label: newLabel.trim() || def.label, description: def.description },
    ]);
    setNewKey('');
    setNewLabel('');
  };

  const removeOption = (key: string) => {
    const next = options.filter((o) => o.key !== key);
    if (next.length === 0) return; // keep at least one option
    setOptions(next);
    if (attribute === key) setAttribute(next[0].key);
  };

  const save = async () => {
    setSaving(true);
    try {
      const optRes = await fetch('/api/settings/stats-attribute-options', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          options: options
            .map(({ key, label }) => ({ key, label: label.trim() }))
            .filter((o) => o.label),
        }),
      });
      const optData = await optRes.json();
      if (!optRes.ok) throw new Error(optData.error || 'Failed to save options');

      const attrRes = await fetch('/api/settings/stats-attribute', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attribute }),
      });
      const attrData = await attrRes.json();
      if (!attrRes.ok) throw new Error(attrData.error || 'Failed to save default');
      toast({ title: 'Stats attribution saved / Qoodaan olmaa' });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-teal-600" />
          Sector Distribution Attribution / Qooda Goossa
        </CardTitle>
        <CardDescription>
          Manage what the Industry Stats &ldquo;Sector Distribution&rdquo; chart can group by:
          rename options, add new ones, remove unneeded ones, and pick the default. The chart can
          still be switched between the enabled options at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
          </div>
        ) : (
          <>
            {/* Enabled options — rename inline or remove */}
            <div className="space-y-2">
              <Label>Attribution options / Filannoo Qooda Goossa</Label>
              <div className="space-y-2">
                {options.map((o) => (
                  <div key={o.key} className="flex items-center gap-2">
                    <Input
                      value={o.label}
                      onChange={(e) =>
                        setOptions(
                          options.map((x) => (x.key === o.key ? { ...x, label: e.target.value } : x))
                        )
                      }
                      className="h-9 flex-1"
                      aria-label={`Label for ${o.key}`}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => removeOption(o.key)}
                      disabled={options.length <= 1}
                      aria-label={`Remove ${o.label}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Add a new attribute from the registry */}
            {addable.length > 0 ? (
              <div className="space-y-2">
                <Label>Add attribute / Qooda dabaluu</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={newKey} onValueChange={setNewKey}>
                    <SelectTrigger className="h-9 sm:w-56">
                      <SelectValue placeholder="Choose / Filadhu" />
                    </SelectTrigger>
                    <SelectContent>
                      {addable.map((a) => (
                        <SelectItem key={a.key} value={a.key}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder={
                      STATS_ATTRIBUTES.find((a) => a.key === newKey)?.label ||
                      'Custom label (optional) / Maqaa'
                    }
                    className="h-9 flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addOption}
                    disabled={!newKey}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    Add / Dabaluu
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                All available attributes are in use / Filannoo hunduu kan fayyadamaa jiru
              </p>
            )}

            {/* Default grouping among enabled options */}
            <div className="space-y-2">
              <Label>Default grouping / Qooda durtii</Label>
              <RadioGroup value={attribute} onValueChange={setAttribute} className="gap-2">
                {options.map((o) => (
                  <label
                    key={o.key}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${
                      attribute === o.key ? 'border-teal-500 bg-teal-50' : 'hover:bg-muted/40'
                    }`}
                  >
                    <RadioGroupItem value={o.key} className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium">{o.label}</span>
                      <span className="block text-xs text-muted-foreground">{o.description}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          </>
        )}
        <Button onClick={save} disabled={saving || loading}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save / Olmaa
        </Button>
      </CardContent>
    </Card>
  );
}
