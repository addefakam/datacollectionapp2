'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/components/SettingsProvider';
import {
  Rocket,
  Loader2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Check,
  CalendarClock,
  Plus,
  Trash2,
  Target,
  Building2,
  Eye,
} from 'lucide-react';
import { INITIATIVE_CATEGORIES, PERIOD_LABELS, TARGET_PERIOD_TYPES } from '@/lib/initiative-monitor';

interface InitiativeSurveyFormProps {
  onSubmit: () => void;
  surveyorName: string;
  surveyorId: string;
}

interface TargetRow {
  metric: string;
  unit: string;
  targetValue: string;
  periodType: string;
  dueDate: string;
}

const STEPS = [
  { id: 1, title: 'Initiative', titleOr: 'Kaa\'umsa', icon: Rocket },
  { id: 2, title: 'Timeline', titleOr: 'Yeroon', icon: CalendarClock },
  { id: 3, title: 'Targets & Review', titleOr: 'Kaayyoo', icon: Target },
];

const emptyTarget: TargetRow = { metric: '', unit: '', targetValue: '', periodType: 'total', dueDate: '' };

export default function InitiativeSurveyForm({ onSubmit, surveyorName }: InitiativeSurveyFormProps) {
  const { toast } = useToast();
  const { subCities, areasFor } = useSettings();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [selectedSubCity, setSelectedSubCity] = useState('');
  const [areas, setAreas] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    category: '',
    departmentId: '',
    subCity: '',
    area: '',
    description: '',
    establishmentDate: '',
    expectedOperationalDate: '',
    location: '',
    contactName: '',
    contactPhone: '',
  });
  const [targets, setTargets] = useState<TargetRow[]>([{ ...emptyTarget }]);

  useEffect(() => {
    fetch('/api/departments')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDepartments(Array.isArray(d) ? d : []))
      .catch(() => setDepartments([]));
  }, []);

  const setField = (name: string, value: string) =>
    setFormData((prev) => ({ ...prev, [name]: value }));

  const handleSubCityChange = (value: string) => {
    setSelectedSubCity(value);
    setAreas(areasFor(value));
    setFormData((prev) => ({ ...prev, subCity: value, area: '' }));
  };

  const setTarget = (idx: number, patch: Partial<TargetRow>) =>
    setTargets((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      if (!formData.name.trim()) { toast({ title: 'Name required', description: 'Give the initiative a name / Maqaa kaa\'umsa barbaachisa', variant: 'destructive' }); return false; }
      if (!formData.category) { toast({ title: 'Category required', description: 'Select the initiative category', variant: 'destructive' }); return false; }
      if (!formData.departmentId) { toast({ title: 'Department required', description: 'Select the responsible department / Wolfamtoota filadhu', variant: 'destructive' }); return false; }
      if (!formData.subCity) { toast({ title: 'Sub-City required', description: 'Select the sub-city / Kutaa magaalaa filadhu', variant: 'destructive' }); return false; }
      return true;
    }
    if (step === 2) {
      if (formData.establishmentDate && formData.expectedOperationalDate &&
          formData.expectedOperationalDate < formData.establishmentDate) {
        toast({ title: 'Invalid timeline', description: 'Expected fully-operational date must be on or after establishment', variant: 'destructive' });
        return false;
      }
      if (formData.contactPhone) {
        const clean = formData.contactPhone.replace(/[\s-]/g, '');
        if (!/^(\+251|251|0)?(9|7)\d{8}$/.test(clean)) {
          toast({ title: 'Invalid phone number', description: 'Use Ethiopian format: 09XXXXXXXX', variant: 'destructive' });
          return false;
        }
      }
      return true;
    }
    // step 3 — targets (all optional, but filled rows must be complete)
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const metricFilled = t.metric.trim() !== '';
      const valueFilled = t.targetValue.trim() !== '';
      if (!metricFilled && !valueFilled) continue; // empty row → ignored
      if (!metricFilled || !valueFilled) {
        toast({ title: 'Incomplete target', description: `Target ${i + 1}: fill both the metric and its target value, or remove the row`, variant: 'destructive' });
        return false;
      }
      const v = Number(t.targetValue);
      if (!Number.isFinite(v) || v <= 0) {
        toast({ title: 'Invalid target value', description: `Target ${i + 1} value must be a number greater than 0`, variant: 'destructive' });
        return false;
      }
    }
    return true;
  };

  const nextStep = () => { if (validateStep(currentStep)) setCurrentStep((s) => Math.min(STEPS.length, s + 1)); };
  const prevStep = () => setCurrentStep((s) => Math.max(1, s - 1));

  const resetForm = () => {
    setFormData({
      name: '', category: '', departmentId: '', subCity: '', area: '', description: '',
      establishmentDate: '', expectedOperationalDate: '', location: '', contactName: '', contactPhone: '',
    });
    setTargets([{ ...emptyTarget }]);
    setSelectedSubCity('');
    setAreas([]);
    setCurrentStep(1);
  };

  const departmentName = (id: string) => departments.find((d) => d.id === id)?.name ?? '—';
  const activeTargets = targets.filter((t) => t.metric.trim() && t.targetValue.trim());

  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/initiatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          contactPhone: formData.contactPhone.replace(/[\s-]/g, ''),
          surveyorName,
          targets: activeTargets.map((t) => ({
            metric: t.metric.trim(),
            unit: t.unit.trim() || null,
            targetValue: Number(t.targetValue),
            periodType: t.periodType,
            dueDate: t.dueDate || null,
          })),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: 'Could not save', description: payload.error || `Server responded ${res.status}`, variant: 'destructive' });
        return;
      }
      toast({ title: 'Initiative registered / Galmeeffame', description: `"${formData.name}" is now monitored from establishment to full operation.` });
      resetForm();
      onSubmit();
    } catch {
      toast({ title: 'Network error', description: 'Check your connection and try again.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Step indicator */}
      <div className="rounded-xl border bg-white p-3 shadow-sm sm:p-4">
        <div className="flex items-center">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            return (
              <div key={step.id} className="flex flex-1 items-center last:flex-none">
                <button
                  type="button"
                  onClick={() => (step.id < currentStep || validateStep(currentStep)) && setCurrentStep(step.id)}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 sm:flex-none sm:flex-row sm:gap-1.5 sm:px-2 ${
                    isCurrent ? 'text-emerald-700' : isCompleted ? 'text-emerald-600' : 'text-gray-400'
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full sm:h-8 sm:w-8 ${
                      isCurrent
                        ? 'bg-brand-gradient text-white shadow-md shadow-emerald-600/25'
                        : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {isCompleted ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  </div>
                  <span className="w-full truncate text-center text-[9px] font-medium sm:w-auto sm:text-[10px]">{step.title}</span>
                  <span className="hidden text-[8px] leading-tight sm:block sm:text-[9px]">{step.titleOr}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`mx-0.5 h-0.5 flex-1 rounded sm:mx-1 ${currentStep > step.id ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground sm:mt-2 sm:text-xs">
          <span>Step {currentStep} of {STEPS.length} / Qajeelfannaa {currentStep} kiyya {STEPS.length} keessaa</span>
          <button type="button" onClick={resetForm} className="flex items-center gap-1 text-red-500 hover:text-red-700">
            <RotateCcw className="h-3 w-3" />
            <span className="hidden sm:inline">Reset / Balleessuu</span><span className="sm:hidden">Reset</span>
          </button>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <Card className="min-h-[300px] sm:min-h-[360px]">
          {/* Step 1 — Initiative */}
          {currentStep === 1 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <Rocket className="h-4 w-4 shrink-0 text-emerald-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Kaa&apos;umsa Galmeessi<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Establish the initiative</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  The sub-city registers the initiative and the department responsible for it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="init-name" className="text-xs sm:text-sm">Initiative Name <span className="text-red-500">*</span></Label>
                  <Input id="init-name" placeholder="e.g., Dhibayyuu Market Development" value={formData.name} onChange={(e) => setField('name', e.target.value)} className="text-sm sm:text-base" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-xs sm:text-sm">Category <span className="text-red-500">*</span></Label>
                    <Select value={formData.category} onValueChange={(v) => setField('category', v)}>
                      <SelectTrigger className="text-sm sm:text-base"><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
                      <SelectContent>{INITIATIVE_CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-xs sm:text-sm">Responsible Department <span className="text-red-500">*</span></Label>
                    <Select value={formData.departmentId} onValueChange={(v) => setField('departmentId', v)}>
                      <SelectTrigger className="text-sm sm:text-base"><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        {departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-xs sm:text-sm">Sub-City <span className="text-red-500">*</span></Label>
                    <Select value={formData.subCity} onValueChange={handleSubCityChange}>
                      <SelectTrigger className="text-sm sm:text-base"><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
                      <SelectContent>{subCities.map((sc) => (<SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-xs sm:text-sm">Werreda</Label>
                    <Select value={formData.area} onValueChange={(v) => setField('area', v)} disabled={!selectedSubCity}>
                      <SelectTrigger className="text-sm sm:text-base"><SelectValue placeholder={selectedSubCity ? 'Select / Filadhu' : 'Select sub-city first'} /></SelectTrigger>
                      <SelectContent>{areas.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="init-desc" className="text-xs sm:text-sm">Description</Label>
                  <Textarea id="init-desc" rows={3} placeholder="What the initiative will deliver for the sub-city" value={formData.description} onChange={(e) => setField('description', e.target.value)} className="text-sm sm:text-base" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="init-location" className="text-xs sm:text-sm">Location</Label>
                  <Input id="init-location" placeholder="Site / kebele / landmark (optional)" value={formData.location} onChange={(e) => setField('location', e.target.value)} className="text-sm sm:text-base" />
                </div>
              </CardContent>
            </>
          )}

          {/* Step 2 — Timeline & contact */}
          {currentStep === 2 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <CalendarClock className="h-4 w-4 shrink-0 text-emerald-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Yeroon fi Quunnamtii<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Follow-up timeline &amp; contact</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Delays are computed against the expected fully-operational date.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="init-est" className="text-xs sm:text-sm">Establishment Date</Label>
                    <Input id="init-est" type="date" max={todayStr} value={formData.establishmentDate} onChange={(e) => setField('establishmentDate', e.target.value)} className="text-sm sm:text-base" />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="init-exp" className="text-xs sm:text-sm">Expected Fully Operational <span className="text-red-500">*</span></Label>
                    <Input id="init-exp" type="date" value={formData.expectedOperationalDate} onChange={(e) => setField('expectedOperationalDate', e.target.value)} className="text-sm sm:text-base" />
                    <p className="text-[11px] text-muted-foreground">The deadline the sub-city holds the department to.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="init-contact" className="text-xs sm:text-sm">Contact Person</Label>
                    <Input id="init-contact" placeholder="Department focal person" value={formData.contactName} onChange={(e) => setField('contactName', e.target.value)} className="text-sm sm:text-base" />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="init-phone" className="text-xs sm:text-sm">Contact Phone</Label>
                    <Input id="init-phone" type="tel" placeholder="09XX XXX XXX" value={formData.contactPhone} onChange={(e) => setField('contactPhone', e.target.value)} className="text-sm sm:text-base" />
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 3 — Targets & review */}
          {currentStep === 3 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <Target className="h-4 w-4 shrink-0 text-emerald-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Kaayyoo Kaawwachuu<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Set targets, then review</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Quantitative targets the responsible department must achieve and report against daily.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {targets.map((t, idx) => (
                    <div key={idx} className="rounded-lg border bg-emerald-50/40 p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-800">Target {idx + 1}</span>
                        {targets.length > 1 && (
                          <button type="button" onClick={() => setTargets((prev) => prev.filter((_, i) => i !== idx))} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                            <Trash2 className="h-3 w-3" /> Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Metric (what is measured) <span className="text-red-500">*</span></Label>
                          <Input placeholder="e.g., Road constructed" value={t.metric} onChange={(e) => setTarget(idx, { metric: e.target.value })} className="text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unit</Label>
                          <Input placeholder="e.g., km, households, ETB" value={t.unit} onChange={(e) => setTarget(idx, { unit: e.target.value })} className="text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Target Value <span className="text-red-500">*</span></Label>
                          <Input type="number" min="0" step="any" placeholder="e.g., 10" value={t.targetValue} onChange={(e) => setTarget(idx, { targetValue: e.target.value })} className="text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Period</Label>
                          <Select value={t.periodType} onValueChange={(v) => setTarget(idx, { periodType: v })}>
                            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>{TARGET_PERIOD_TYPES.map((p) => (<SelectItem key={p} value={p}>{PERIOD_LABELS[p] ?? p}</SelectItem>))}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Due Date</Label>
                          <Input type="date" value={t.dueDate} onChange={(e) => setTarget(idx, { dueDate: e.target.value })} className="text-sm" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setTargets((prev) => [...prev, { ...emptyTarget }])} className="w-full border-dashed">
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add another target
                  </Button>
                </div>

                {/* Review */}
                <div className="rounded-lg border bg-white p-3 text-sm space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Eye className="h-3.5 w-3.5" /> Review</p>
                  <p><span className="text-muted-foreground">Initiative:</span> <span className="font-semibold">{formData.name || '—'}</span></p>
                  <p><span className="text-muted-foreground">Responsible:</span> <span className="font-semibold inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-emerald-700" />{departmentName(formData.departmentId)}</span></p>
                  <p><span className="text-muted-foreground">Location:</span> {[formData.subCity, formData.area].filter(Boolean).join(' · ') || '—'}</p>
                  <p><span className="text-muted-foreground">Timeline:</span> {[formData.establishmentDate, formData.expectedOperationalDate].filter(Boolean).join(' → ') || '—'}</p>
                  <p><span className="text-muted-foreground">Targets:</span> {activeTargets.length || 'None yet'}</p>
                </div>
              </CardContent>
            </>
          )}

          {/* Navigation */}
          <CardContent className="flex items-center justify-between gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={prevStep} disabled={currentStep === 1} className="min-w-24">
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            {currentStep < STEPS.length ? (
              <Button type="button" onClick={nextStep} className="bg-brand-gradient min-w-24 font-semibold">
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={isSubmitting} className="bg-brand-gradient min-w-32 font-semibold">
                {isSubmitting ? (<><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</>) : (<><Rocket className="mr-1.5 h-4 w-4" /> Register Initiative</>)}
              </Button>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
