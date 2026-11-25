'use client';

/**
 * Admin management section for a module's survey questionnaire — the generic
 * counterpart of the Industry questionnaire editor. Shared by each module's
 * "Manage" workspace (page.tsx) and Administration → Settings → Survey
 * (SettingsManager).
 *
 * SurveyQuestionsSection: the survey questionnaire — hide/show questions,
 * required flags, bilingual labels and per-step ordering. The module's survey
 * form, its step validation, the review list and the server-side POST
 * validation follow this questionnaire immediately.
 */

import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  SURVEY_SECTORS,
  isSurveySectorId,
  sectorSurveyFieldDef,
  sectorSurveyFieldsDefault,
  type SurveyFieldConfig,
  type SurveySectorId,
} from '@/lib/survey-fields';

/** Default view when the settings request fails (offline etc.) or the id is bad. */
function fallbackFields(sector: string): SurveyFieldConfig[] {
  if (isSurveySectorId(sector)) return sectorSurveyFieldsDefault(sector);
  return [];
}

export function SurveyQuestionsSection({ sector }: { sector: string }) {
  const { toast } = useToast();
  const validSector = isSurveySectorId(sector);
  const sectorId: SurveySectorId | null = validSector ? sector : null;
  const meta = sectorId ? SURVEY_SECTORS[sectorId] : null;

  const [fields, setFields] = useState<SurveyFieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      if (!cancelled) setFields(sectorSurveyFieldsDefault(sectorId));
    })();
    return () => {
      cancelled = true;
    };
  }, [sectorId]);

  if (!validSector || !sectorId || !meta) return null;

  const def = (key: string) => sectorSurveyFieldDef(sectorId, key);
  const steps = [1, 2, 3] as const;

  /** Move a question up/down within its own wizard step. */
  const move = (key: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.key === key);
    const step = def(key)?.step;
    if (idx < 0 || step == null) return;
    // positions of this step's questions inside the flat array
    const stepIdxs = fields
      .map((f, i) => (def(f.key)?.step === step ? i : -1))
      .filter((i) => i >= 0);
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
    }
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
          Manage the {meta.label} survey questionnaire: hide questions, change required flags, edit
          labels and reorder them inside their step. Core identification questions (name, type,
          location, headline count, contact) cannot be removed. The survey form, its validation and
          the server follow this questionnaire immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step) => {
          const stepFields = fields.filter((f) => def(f.key)?.step === step);
          if (stepFields.length === 0) return null;
          return (
            <div key={step} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {meta.stepTitles[step]}
              </p>
              <div className="overflow-hidden rounded-lg border">
                {stepFields.map((f, i) => {
                  const d = def(f.key)!;
                  const requiredLockable = !d.requiredFixed && f.enabled && d.input !== 'radio-yesno';
                  return (
                    <div
                      key={f.key}
                      data-field-key={f.key}
                      className={`flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center ${i > 0 ? 'border-t' : ''} ${f.enabled ? '' : 'bg-muted/40'}`}
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
                      {/* Labels */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <Input
                          value={f.labelEn}
                          onChange={(e) => update(f.key, { labelEn: e.target.value })}
                          className="h-8 text-xs sm:text-sm"
                          placeholder={d.labelEn}
                        />
                        <Input
                          value={f.labelOr}
                          onChange={(e) => update(f.key, { labelOr: e.target.value })}
                          className="h-7 border-dashed text-[11px] text-muted-foreground sm:text-xs"
                          placeholder={d.labelOr}
                        />
                      </div>
                      {/* Flags */}
                      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                        {d.locked ? (
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
                      </div>
                    </div>
                  );
                })}
              </div>
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
            Hidden questions store empty/default values for new records / Gaaffii dhokame duwwaa galmeefama
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
