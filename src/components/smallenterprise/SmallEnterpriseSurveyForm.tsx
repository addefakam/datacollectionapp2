'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Store,
  Loader2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Check,
  UserCircle,
  Phone,
  FileText,
  Eye,
} from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SMALL_ENTERPRISE_TYPES, SMALL_ENTERPRISE_OWNERSHIP_TYPES } from '@/lib/location-data';
import { SME_STATUS_META, SME_STATUSES, type SmeStatus } from '@/lib/sme';
import { useSettings } from '@/components/SettingsProvider';
import {
  sectorSurveyFieldEnabled,
  sectorSurveyFieldRequired,
  sectorSurveyFieldsDefault,
  type SurveyFieldConfig,
} from '@/lib/survey-fields';

interface SmallEnterpriseSurveyFormProps {
  onSubmit: () => void;
  surveyorName: string;
  surveyorId: string;
  isOnline?: boolean;
  onOfflineSave?: (data: Record<string, unknown>) => Promise<boolean>;
}

const STEPS = [
  { id: 1, title: 'Enterprise', titleOr: 'Midhaalee', icon: Store },
  { id: 2, title: 'Capacity', titleOr: 'Dandeettii', icon: FileText },
  { id: 3, title: 'Contact', titleOr: 'Quunnamtii', icon: Phone },
  { id: 4, title: 'Review', titleOr: 'Mirkanaa', icon: Eye },
];

/** Uniform question label: admin-managed English label + Afaan Oromoo sub-label + required star. */
function FieldLabel({ id, en, or, required }: { id: string; en: string; or?: string; required?: boolean }) {
  return (
    <Label htmlFor={id} className="text-xs sm:text-sm">
      {en}
      {or ? (<><br /><span className="text-xs font-normal text-muted-foreground">{or}</span></>) : null}
      {required ? <span className="text-red-500"> *</span> : null}
    </Label>
  );
}

export default function SmallEnterpriseSurveyForm({
  onSubmit,
  surveyorName,
  surveyorId,
  isOnline = true,
  onOfflineSave,
}: SmallEnterpriseSurveyFormProps) {
  const { toast } = useToast();
  const { subCities, areasFor } = useSettings();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedSubCity, setSelectedSubCity] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [dataConfirmed, setDataConfirmed] = useState('');

  // Admin-managed questionnaire (Manage workspace → Survey Questions);
  // registry defaults until it loads (offline keeps the defaults).
  const [fields, setFields] = useState<SurveyFieldConfig[]>(() =>
    sectorSurveyFieldsDefault('small-enterprise')
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/survey-fields/small-enterprise')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unavailable'))))
      .then((d) => {
        if (!cancelled && Array.isArray(d.fields) && d.fields.length > 0) setFields(d.fields);
      })
      .catch(() => {
        // offline — keep registry defaults
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Questionnaire accessors: shown / required / admin-managed bilingual label.
  const shown = (key: string) => sectorSurveyFieldEnabled('small-enterprise', fields, key);
  const req = (key: string) => sectorSurveyFieldRequired('small-enterprise', fields, key);
  const label = (key: string) => {
    const f = fields.find((x) => x.key === key);
    return { en: f?.labelEn ?? key, or: f?.labelOr ?? '' };
  };

  const emptyForm = {
    enterpriseName: '',
    enterpriseType: '',
    ownershipType: 'SME',
    subCity: '',
    area: '',
    specificAddress: '',
    licenseNumber: '',
    employeeCount: '',
    maleEmployees: '',
    femaleEmployees: '',
    startupCapital: '',
    hasPremises: 'no',
    hasTraining: 'no',
    status: 'REGISTERED',
    contactName: '',
    contactPhone: '',
  };

  const [formData, setFormData] = useState(emptyForm);

  const handleSubCityChange = (value: string) => {
    setSelectedSubCity(value);
    setAreas(areasFor(value));
    setFormData((prev) => ({ ...prev, subCity: value, area: '' }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /**
   * Sex breakdown inputs: when both male and female are filled and the total
   * is still empty, auto-fill the total with their sum.
   */
  const handleSexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value } as typeof prev;
      const male = name === 'maleEmployees' ? value : next.maleEmployees;
      const female = name === 'femaleEmployees' ? value : next.femaleEmployees;
      if (next.employeeCount === '' && male !== '' && female !== '') {
        const sum = Number(male) + Number(female);
        if (Number.isFinite(sum) && sum >= 0) return { ...next, employeeCount: String(sum) };
      }
      return next;
    });
  };

  /** Shared step validation for one male/female pair against its total. */
  const validateSexPair = (maleStr: string, femaleStr: string, totalStr: string, totalLabel: string): boolean => {
    const male = maleStr === '' ? 0 : Number(maleStr);
    const female = femaleStr === '' ? 0 : Number(femaleStr);
    if (!Number.isFinite(male) || male < 0 || !Number.isFinite(female) || female < 0) {
      toast({ title: 'Invalid Sex Counts / Lakkoofsa Sanyii Dogoggora', description: `Male and female ${totalLabel.toLowerCase()} must be non-negative numbers / Lakkoofsi dhiira fi dubartii lakkoofsa diidaa hin qabaatu`, variant: 'destructive' });
      return false;
    }
    if (male + female > 0 && male + female !== Number(totalStr)) {
      toast({ title: 'Sex Counts Mismatch / Lakkoofsa Sanyii Hin Wal Qabne', description: `Male + Female (${male + female}) must equal ${totalLabel} (${totalStr}) / Dhiira fi Dubartii lakkoofsa waliigalaa wajjin wal qabachuu qabu`, variant: 'destructive' });
      return false;
    }
    return true;
  };

  const validateStep = (step: number): boolean => {
    /** First missing required field of a step (missing = empty AND questionnaire-required). */
    const missingRequired = (keys: string[]): string | null => {
      for (const key of keys) {
        if (req(key) && !formData[key as keyof typeof formData]) return label(key).en;
      }
      return null;
    };
    switch (step) {
      case 1: {
        const missing = missingRequired(['enterpriseName', 'enterpriseType', 'subCity', 'area', 'specificAddress']);
        if (missing) {
          toast({ title: 'Field Missing / Qabiyyee Hin Jiru', description: `Required: ${missing} / Barbaachisaadha`, variant: 'destructive' });
          return false;
        }
        return true;
      }
      case 2: {
        const missing = missingRequired(['ownershipType']);
        if (missing) {
          toast({ title: 'Field Missing / Qabiyyee Hin Jiru', description: `Required: ${missing} / Barbaachisaadha`, variant: 'destructive' });
          return false;
        }
        if (!formData.employeeCount || Number(formData.employeeCount) < 0) {
          toast({ title: 'Invalid Employee Count / Lakkoofsa Hojjetaa Dogoggora', description: 'Enter a valid employee count / Lakkoofsa hojjetaa sirrii galchi', variant: 'destructive' });
          return false;
        }
        if (shown('employeesSex') && !validateSexPair(formData.maleEmployees, formData.femaleEmployees, formData.employeeCount, 'Employee Count')) return false;
        if (shown('startupCapital') && formData.startupCapital !== '' && (Number.isNaN(Number(formData.startupCapital)) || Number(formData.startupCapital) < 0)) {
          toast({ title: 'Invalid Capital / Maallaqa Dogoggora', description: 'Startup capital cannot be negative / Maallaqa jalqabaa diidaa hin qabaatu', variant: 'destructive' });
          return false;
        }
        return true;
      }
      case 3: {
        const missing = missingRequired(['contactName', 'contactPhone']);
        if (missing) {
          toast({ title: 'Field Missing / Qabiyyee Hin Jiru', description: `Required: ${missing} / Barbaachisaadha`, variant: 'destructive' });
          return false;
        }
        {
          const phoneClean = formData.contactPhone.replace(/[\s-]/g, '');
          const ethPhoneRegex = /^(\+251|251|0)?(9|7)\d{8}$/;
          if (!ethPhoneRegex.test(phoneClean)) {
            toast({ title: 'Invalid Phone / Bilbila Dogoggora', description: 'Enter valid Ethiopian number (e.g., +251 91 234 5678)', variant: 'destructive' });
            return false;
          }
        }
        return true;
      }
      case 4:
        if (dataConfirmed !== 'yes') {
          toast({ title: 'Confirmation Required / Mirkanaa\u2019uu Barbaachisaa', description: 'Please confirm data is true and authenticated / Daataan dhugaa fi mirkanaa\u2019eef mirkanaadhu', variant: 'destructive' });
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => { if (validateStep(currentStep)) setCurrentStep((s) => Math.min(s + 1, STEPS.length)); };
  const prevStep = () => { setCurrentStep((s) => Math.max(s - 1, 1)); };

  const resetForm = () => {
    setFormData(emptyForm);
    setSelectedSubCity('');
    setAreas([]);
    setDataConfirmed('');
    setCurrentStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(currentStep)) return;
    const payload = {
      ...formData,
      employeeCount: Number(formData.employeeCount || 0),
      maleEmployees: formData.maleEmployees === '' ? 0 : Number(formData.maleEmployees),
      femaleEmployees: formData.femaleEmployees === '' ? 0 : Number(formData.femaleEmployees),
      startupCapital: formData.startupCapital === '' ? null : Number(formData.startupCapital),
      hasPremises: formData.hasPremises === 'yes',
      hasTraining: formData.hasTraining === 'yes',
      surveyorName,
      surveyorId,
    };
    setIsSubmitting(true);
    if (isOnline) {
      try {
        const response = await fetch('/api/smallenterprises', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          if (response.status >= 400 && response.status < 500) {
            // Server permanently rejected the record (validation) — queueing it offline would never succeed.
            toast({ title: 'Submission Rejected / Galmeen Morkame', description: err.error || 'Please correct the highlighted fields and submit again', variant: 'destructive' });
            return;
          }
          throw new Error(err.error || 'Server unavailable');
        }
        toast({ title: 'Survey Submitted! / Galma Qabame!', description: `${formData.enterpriseName} recorded successfully / galmeen safiisan argame` });
        resetForm();
        onSubmit();
      } catch (error) {
        if (onOfflineSave) {
          const saved = await onOfflineSave(payload);
          if (saved) { toast({ title: 'Saved Offline / Offliin Kuusame', description: 'Will sync when connected / Netiirkii qunnamaa waanin dhiheenya' }); resetForm(); onSubmit(); }
          else { toast({ title: 'Submission Failed / Galmeen Hin Dhufne', description: error instanceof Error ? error.message : 'Please try again / Dabalataan yaali', variant: 'destructive' }); }
        } else { toast({ title: 'Submission Failed / Galmeen Hin Dhufne', description: error instanceof Error ? error.message : 'Please try again / Dabalataan yaali', variant: 'destructive' }); }
      } finally { setIsSubmitting(false); }
    } else {
      if (onOfflineSave) {
        const saved = await onOfflineSave(payload);
        if (saved) { toast({ title: 'Saved Offline / Offliin Kuusame', description: 'Will sync when connected / Netiirkii qunnamaa waanin dhiheenya' }); resetForm(); onSubmit(); }
        else { toast({ title: 'Save Failed / Hin Kuusanne', description: 'Storage full or unavailable / Qabiyyee dhiphaachaa ykn hin jiru', variant: 'destructive' }); }
      }
      setIsSubmitting(false);
    }
  };

  const reviewItems = (
    [
      shown('enterpriseName') && { label: 'Enterprise / Midhaalee', value: formData.enterpriseName },
      shown('enterpriseType') && { label: 'Enterprise Type / Gosa', value: formData.enterpriseType },
      shown('status') && { label: 'Current Status / Sadarkaa', value: SME_STATUS_META[(formData.status as SmeStatus) in SME_STATUS_META ? (formData.status as SmeStatus) : 'REGISTERED'].label },
      shown('ownershipType') && { label: 'Ownership / Abbaa Qabuu', value: formData.ownershipType },
      shown('subCity') && { label: 'Sub-City / Kututtaa Maggalaa', value: formData.subCity },
      shown('area') && { label: 'Werreda', value: formData.area },
      shown('specificAddress') && { label: 'Address / Baka Addaa', value: formData.specificAddress },
      shown('licenseNumber') && { label: 'License No. / Lakofsaa Eyyeema', value: formData.licenseNumber || '—' },
      shown('employeeCount') && { label: 'Employees / Hojjetaa', value: formData.employeeCount },
      shown('employeesSex') && { label: 'Male / Dhiira', value: formData.maleEmployees === '' ? '—' : formData.maleEmployees },
      shown('employeesSex') && { label: 'Female / Dubartii', value: formData.femaleEmployees === '' ? '—' : formData.femaleEmployees },
      shown('startupCapital') && { label: 'Startup Capital (ETB)', value: formData.startupCapital === '' ? '—' : formData.startupCapital },
      shown('hasPremises') && { label: 'Own Premises', value: formData.hasPremises === 'yes' ? 'Yes / Eyee' : 'No / Lakki' },
      shown('hasTraining') && { label: 'MSE Training', value: formData.hasTraining === 'yes' ? 'Yes / Eyee' : 'No / Lakki' },
      shown('contactName') && { label: 'Contact / Quunnamtii', value: `${formData.contactName} — ${formData.contactPhone}` },
    ].filter(Boolean) as { label: string; value: string }[]
  );

  return (
    <div className="mx-auto max-w-2xl">
      {/* Step Indicator */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:gap-0 sm:pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            return (
              <div key={step.id} className="flex flex-1 shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => isCompleted && setCurrentStep(step.id)}
                  className={`flex w-full flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition-all sm:gap-1 sm:rounded-xl sm:px-2 sm:py-2 ${
                    isActive ? 'bg-amber-600 text-white shadow-md sm:shadow-lg sm:shadow-amber-100'
                      : isCompleted ? 'bg-amber-100 text-amber-700 cursor-pointer'
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full sm:h-8 sm:w-8 ${isCompleted ? 'bg-amber-600 text-white' : ''}`}>
                    {isCompleted ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  </div>
                  <span className="text-[9px] leading-tight font-medium text-center truncate w-full sm:text-[10px]">{step.title}</span>
                  <span className="hidden text-[8px] leading-tight text-center opacity-75 truncate w-full sm:block sm:text-[9px]">{step.titleOr}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`mx-0.5 h-0.5 flex-1 rounded sm:mx-1 ${currentStep > step.id ? 'bg-amber-500' : 'bg-gray-200'}`} />
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

      <form onSubmit={handleSubmit}>
        <Card className="min-h-[300px] sm:min-h-[360px]">
          {/* Step 1: Enterprise */}
          {currentStep === 1 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <Store className="h-4 w-4 shrink-0 text-amber-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Odeeffannoo Midhaalee<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Small enterprise information</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Basic details about the small enterprise (MSE)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="enterpriseName" en={label('enterpriseName').en} or={label('enterpriseName').or} required={req('enterpriseName')} />
                  <Input id="enterpriseName" name="enterpriseName" placeholder="e.g., TIGIST TAILORING WORKSHOP" value={formData.enterpriseName} onChange={handleChange} required className="text-sm sm:text-base" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="enterpriseType" en={label('enterpriseType').en} or={label('enterpriseType').or} required={req('enterpriseType')} />
                  <Select value={formData.enterpriseType} onValueChange={(v) => handleSelectChange('enterpriseType', v)}>
                    <SelectTrigger id="enterpriseType" className="text-sm sm:text-base"><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
                    <SelectContent className="max-h-64">{SMALL_ENTERPRISE_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <FieldLabel id="subCity" en={label('subCity').en} or={label('subCity').or} required={req('subCity')} />
                    <Select value={formData.subCity} onValueChange={handleSubCityChange}>
                      <SelectTrigger id="subCity" className="text-sm sm:text-base"><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
                      <SelectContent>{subCities.map((sc) => (<SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <FieldLabel id="area" en={label('area').en} or={label('area').or} required={req('area')} />
                    <Select value={formData.area} onValueChange={(v) => handleSelectChange('area', v)} disabled={!selectedSubCity}>
                      <SelectTrigger id="area" className="text-sm sm:text-base"><SelectValue placeholder={selectedSubCity ? 'Select / Filadhu' : 'Select sub-city first'} /></SelectTrigger>
                      <SelectContent>{areas.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                {shown('specificAddress') && (
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="specificAddress" en={label('specificAddress').en} or={label('specificAddress').or} required={req('specificAddress')} />
                  <Input id="specificAddress" name="specificAddress" placeholder="Landmark, street, plot number" value={formData.specificAddress} onChange={handleChange} className="text-sm sm:text-base" />
                </div>
                )}
                {shown('status') && (
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="status" en={label('status').en} or={label('status').or} required={req('status')} />
                  <Select value={formData.status} onValueChange={(v) => handleSelectChange('status', v)}>
                    <SelectTrigger id="status" className="text-sm sm:text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SME_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          <span className="font-medium">{SME_STATUS_META[s].label}</span>
                          <span className="block text-[10px] text-muted-foreground">{SME_STATUS_META[s].description}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Establishment lifecycle: registered → fully legalized → awaiting operation → operational</p>
                </div>
                )}
              </CardContent>
            </>
          )}

          {/* Step 2: Capacity & Support */}
          {currentStep === 2 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <FileText className="h-4 w-4 shrink-0 text-amber-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Dandeettii fi Deeggarsa<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Capacity &amp; support</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">License, ownership, employees, capital and support</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                {shown('licenseNumber') && (
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="licenseNumber" en={label('licenseNumber').en} or={label('licenseNumber').or} required={req('licenseNumber')} />
                  <Input id="licenseNumber" name="licenseNumber" placeholder="e.g., MSE/2024/012" value={formData.licenseNumber} onChange={handleChange} className="text-sm sm:text-base" />
                </div>
                )}
                {shown('ownershipType') && (
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="mse-ownershipType" en={label('ownershipType').en} or={label('ownershipType').or} required={req('ownershipType')} />
                  <RadioGroup value={formData.ownershipType} onValueChange={(v) => handleSelectChange('ownershipType', v)} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {SMALL_ENTERPRISE_OWNERSHIP_TYPES.map((t) => (
                      <div key={t} className="flex items-center space-x-2 rounded-lg border p-2.5 has-data-[state=checked]:border-amber-500 has-data-[state=checked]:bg-amber-50">
                        <RadioGroupItem value={t} id={`mse-ownership-${t}`} />
                        <Label htmlFor={`mse-ownership-${t}`} className="cursor-pointer text-xs sm:text-sm font-normal">{t}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                )}
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="employeeCount" en={label('employeeCount').en} or={label('employeeCount').or} required={req('employeeCount')} />
                  <Input id="employeeCount" name="employeeCount" type="number" min="0" placeholder="e.g., 8" value={formData.employeeCount} onChange={handleChange} required className="text-sm sm:text-base" />
                </div>
                {/* Employees by sex (male / female) */}
                {shown('employeesSex') && (
                <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs sm:text-sm">{label('employeesSex').en}<br /><span className="text-xs font-normal text-muted-foreground">{label('employeesSex').or}</span></Label>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-medium text-amber-700 sm:text-[10px]">Optional / Filannoo</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="maleEmployees" className="text-xs">Male / Dhiira</Label>
                      <Input id="maleEmployees" name="maleEmployees" type="number" min="0" placeholder="e.g., 3" value={formData.maleEmployees} onChange={handleSexChange} className="text-sm sm:text-base" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="femaleEmployees" className="text-xs">Female / Dubartii</Label>
                      <Input id="femaleEmployees" name="femaleEmployees" type="number" min="0" placeholder="e.g., 5" value={formData.femaleEmployees} onChange={handleSexChange} className="text-sm sm:text-base" />
                    </div>
                  </div>
                  <p className="text-[10px] leading-snug text-muted-foreground">Male + Female should equal the Employee Count — leave empty if not known / Dhiira fi Dubartii lakkoofsa waliigalaa wajjin wal qabachuu qabu</p>
                </div>
                )}
                {shown('startupCapital') && (
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="startupCapital" en={label('startupCapital').en} or={label('startupCapital').or} required={req('startupCapital')} />
                  <Input id="startupCapital" name="startupCapital" type="number" min="0" step="any" placeholder="e.g., 85000" value={formData.startupCapital} onChange={handleChange} className="text-sm sm:text-base" />
                </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  {[
                    { name: 'hasPremises', label: 'Own Working Premises', labelOr: 'Iddoo hojii mataa isaa' },
                    { name: 'hasTraining', label: 'MSE Training / Support', labelOr: 'Deeggarsa fi leenjii' },
                  ].filter((svc) => shown(svc.name)).map((svc) => (
                    <div key={svc.name} className="space-y-1.5 sm:space-y-2">
                      <Label className="text-xs sm:text-sm">{label(svc.name).en}<br /><span className="text-xs font-normal text-muted-foreground">{label(svc.name).or}</span></Label>
                      <RadioGroup value={formData[svc.name as keyof typeof formData]} onValueChange={(v) => handleSelectChange(svc.name, v)} className="flex gap-4">
                        <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-amber-500 has-data-[state=checked]:bg-amber-50">
                          <RadioGroupItem value="yes" id={`${svc.name}-yes`} />
                          <Label htmlFor={`${svc.name}-yes`} className="cursor-pointer text-xs sm:text-sm">Yes / Eyee</Label>
                        </div>
                        <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-amber-500 has-data-[state=checked]:bg-amber-50">
                          <RadioGroupItem value="no" id={`${svc.name}-no`} />
                          <Label htmlFor={`${svc.name}-no`} className="cursor-pointer text-xs sm:text-sm">No / Lakki</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  ))}
                </div>
              </CardContent>
            </>
          )}

          {/* Step 3: Contact */}
          {currentStep === 3 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <UserCircle className="h-4 w-4 shrink-0 text-amber-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Odeeffannoo Quunnamtii<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Contact information</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Who we can reach about this enterprise</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="contactName" en={label('contactName').en} or={label('contactName').or} required={req('contactName')} />
                  <Input id="contactName" name="contactName" placeholder="Full name of owner / manager" value={formData.contactName} onChange={handleChange} required className="text-sm sm:text-base" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="contactPhone" en={label('contactPhone').en} or={label('contactPhone').or} required={req('contactPhone')} />
                  <Input id="contactPhone" name="contactPhone" type="tel" placeholder="+251 9X XXX XXXX or 09XXXXXXXX" value={formData.contactPhone} onChange={handleChange} required className="text-sm sm:text-base" />
                  <p className="text-[10px] text-muted-foreground">Ethiopian format: +251 9X XXX XXXX or 09XXXXXXXX</p>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <Eye className="h-4 w-4 shrink-0 text-amber-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Mirkeenya Daataa<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Review &amp; confirm</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Check all information before submitting</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="rounded-lg border bg-slate-50">
                  {reviewItems.map((item) => (
                    <div key={item.label} className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0">
                      <span className="shrink-0 text-[11px] text-muted-foreground sm:text-xs">{item.label}</span>
                      <span className="text-right text-xs font-medium sm:text-sm">{item.value || '—'}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 text-xs font-medium text-amber-900 sm:text-sm">
                    I confirm that the information provided is true and authenticated / Ani daataan kenname dhugaa fi mirkanaa&#39;eef mirkaneera
                  </p>
                  <RadioGroup value={dataConfirmed} onValueChange={setDataConfirmed} className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id="mse-confirm-yes" />
                      <Label htmlFor="mse-confirm-yes" className="cursor-pointer text-xs sm:text-sm">Yes / Eyee</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="mse-confirm-no" />
                      <Label htmlFor="mse-confirm-no" className="cursor-pointer text-xs sm:text-sm">No / Lakki</Label>
                    </div>
                  </RadioGroup>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        {/* Navigation Buttons */}
        <div className="mt-3 flex gap-2 sm:mt-4 sm:gap-3">
          {currentStep > 1 && (
            <Button type="button" variant="outline" onClick={prevStep} className="flex-1 text-sm sm:text-base">
              <ChevronLeft className="h-4 w-4" />
              Back / Gara Duubatti
            </Button>
          )}
          {currentStep < STEPS.length ? (
            <Button type="button" onClick={nextStep} className="flex-[2] bg-amber-600 text-sm text-white hover:bg-amber-700 sm:text-base">
              Next / Itti fufi
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting} className="flex-[2] bg-amber-600 text-sm text-white hover:bg-amber-700 sm:text-base">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Submit Survey / Galchi
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
