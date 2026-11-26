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
  Factory,
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
import { OWNERSHIP_TYPES } from '@/lib/location-data';
import { useSettings } from '@/components/SettingsProvider';
import {
  SURVEY_FIELDS_DEFAULT,
  surveyFieldEnabled,
  surveyFieldRequired,
  type IndustrySurveyFieldConfig,
} from '@/lib/industry-survey-fields';

interface IndustrySurveyFormProps {
  onSubmit: () => void;
  surveyorName: string;
  surveyorId: string;
  isOnline?: boolean;
  onOfflineSave?: (data: Record<string, unknown>) => Promise<boolean>;
}

const STEPS = [
  { id: 1, title: 'Establishment', titleOr: 'Indastrii', icon: Factory },
  { id: 2, title: 'Registration', titleOr: 'Galmee', icon: FileText },
  { id: 3, title: 'Contact', titleOr: 'Quunnamtii', icon: Phone },
  { id: 4, title: 'Review', titleOr: 'Mirkanaa', icon: Eye },
];

/** Uniform question label: admin-managed English label + Afaan Oromoo sub-label + required star. */
function FieldLabel({ id, en, or, required }: { id: string; en: string; or?: string; required?: boolean }) {
  return (
    <Label htmlFor={id} className="text-xs sm:text-sm">
      {en}
      {or ? (
        <>
          <br />
          <span className="text-xs font-normal text-muted-foreground">{or}</span>
        </>
      ) : null}
      {required ? <span className="text-red-500"> *</span> : null}
    </Label>
  );
}

export default function IndustrySurveyForm({
  onSubmit,
  surveyorName,
  surveyorId,
  isOnline = true,
  onOfflineSave,
}: IndustrySurveyFormProps) {
  const { toast } = useToast();
  const { subCities, sectors, areasFor } = useSettings();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedSubCity, setSelectedSubCity] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [dataConfirmed, setDataConfirmed] = useState('');
  // Admin-managed questionnaire (Settings → Survey); registry defaults until it loads.
  const [fields, setFields] = useState<IndustrySurveyFieldConfig[]>(
    SURVEY_FIELDS_DEFAULT.map((f) => ({ ...f }))
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/survey-fields')
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

  const shown = (key: string) => surveyFieldEnabled(fields, key);
  const req = (key: string) => surveyFieldRequired(fields, key);
  const label = (key: string) => {
    const f = fields.find((x) => x.key === key);
    return { en: f?.labelEn ?? key, or: f?.labelOr ?? '' };
  };

  const emptyForm = {
    establishmentName: '',
    sector: '',
    subCity: '',
    area: '',
    specificAddress: '',
    licenseNumber: '',
    ownershipType: '',
    hasEia: 'no',
    hasEmp: 'no',
    eiaApprovalDate: '',
    empApprovalDate: '',
    currentStatus: 'ACTIVE',
    employeeCount: '',
    maleEmployees: '',
    femaleEmployees: '',
    startupCapital: '',
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

  /** First missing required field of a step (missing = empty AND questionnaire-required). */
  const missingRequired = (keys: string[]): string | null => {
    for (const key of keys) {
      if (req(key) && !formData[key as keyof typeof formData]) return label(key).en;
    }
    return null;
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1: {
        const missing = missingRequired(['establishmentName', 'sector', 'subCity', 'area', 'specificAddress']);
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
          toast({ title: 'Invalid Employees / Lakkoofsa Hojjetaa Dogoggora', description: 'Enter a valid employee count / Lakkoofsa hojjetaa sirrii galchi', variant: 'destructive' });
          return false;
        }
        if (shown('employeeSex') && !validateSexPair(formData.maleEmployees, formData.femaleEmployees, formData.employeeCount, 'Employee Count')) return false;
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
      employeeCount: Number(formData.employeeCount),
      maleEmployees: formData.maleEmployees === '' ? 0 : Number(formData.maleEmployees),
      femaleEmployees: formData.femaleEmployees === '' ? 0 : Number(formData.femaleEmployees),
      startupCapital: formData.startupCapital === '' ? null : Number(formData.startupCapital),
      hasEia: formData.hasEia === 'yes',
      hasEmp: formData.hasEmp === 'yes',
      eiaApprovalDate: formData.eiaApprovalDate || null,
      empApprovalDate: formData.empApprovalDate || null,
      currentStatus: formData.currentStatus,
      surveyorName,
      surveyorId,
    };
    setIsSubmitting(true);
    if (isOnline) {
      try {
        const response = await fetch('/api/industries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          if (response.status >= 400 && response.status < 500) {
            // Server permanently rejected the record (validation) — queueing it offline would never succeed.
            toast({ title: 'Submission Rejected / Galmeen Morkame', description: err.error || 'Please correct the highlighted fields and submit again', variant: 'destructive' });
            return;
          }
          throw new Error(err.error || 'Server unavailable');
        }
        toast({ title: 'Survey Submitted! / Galma Qabame!', description: `${formData.establishmentName} recorded successfully / galmeen safiisan argame` });
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

  /** Review step: only the questions the questionnaire shows. */
  const reviewItems = [
    shown('establishmentName') && { label: label('establishmentName').en, value: formData.establishmentName },
    shown('sector') && { label: label('sector').en, value: formData.sector },
    shown('subCity') && { label: label('subCity').en, value: formData.subCity },
    shown('area') && { label: label('area').en, value: formData.area },
    shown('specificAddress') && { label: label('specificAddress').en, value: formData.specificAddress },
    shown('licenseNumber') && { label: label('licenseNumber').en, value: formData.licenseNumber || '—' },
    shown('ownershipType') && { label: label('ownershipType').en, value: formData.ownershipType },
    shown('hasEia') && { label: label('hasEia').en, value: formData.hasEia === 'yes' ? `Yes / Eyee${formData.eiaApprovalDate ? ` — ${formData.eiaApprovalDate}` : ''}` : 'No / Lakki' },
    shown('hasEmp') && { label: label('hasEmp').en, value: formData.hasEmp === 'yes' ? `Yes / Eyee${formData.empApprovalDate ? ` — ${formData.empApprovalDate}` : ''}` : 'No / Lakki' },
    shown('currentStatus') && { label: label('currentStatus').en, value: formData.currentStatus === 'ACTIVE' ? 'Active' : 'Inactive' },
    shown('employeeCount') && { label: label('employeeCount').en, value: formData.employeeCount },
    shown('employeeSex') && { label: label('employeeSex').en, value: `${formData.maleEmployees || '—'} / ${formData.femaleEmployees || '—'}` },
    shown('startupCapital') && { label: label('startupCapital').en, value: formData.startupCapital ? `${formData.startupCapital} ETB` : '—' },
    shown('contactName') && { label: label('contactName').en, value: formData.contactName },
    shown('contactPhone') && { label: label('contactPhone').en, value: formData.contactPhone },
  ].filter(Boolean) as { label: string; value: string }[];

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
                    isActive ? 'bg-teal-600 text-white shadow-md sm:shadow-lg sm:shadow-teal-100'
                      : isCompleted ? 'bg-teal-100 text-teal-700 cursor-pointer'
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full sm:h-8 sm:w-8 ${isCompleted ? 'bg-teal-600 text-white' : ''}`}>
                    {isCompleted ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  </div>
                  <span className="text-[9px] leading-tight font-medium text-center truncate w-full sm:text-[10px]">{step.title}</span>
                  <span className="hidden text-[8px] leading-tight text-center opacity-75 truncate w-full sm:block sm:text-[9px]">{step.titleOr}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`mx-0.5 h-0.5 flex-1 rounded sm:mx-1 ${currentStep > step.id ? 'bg-teal-500' : 'bg-gray-200'}`} />
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
          {/* Step 1: Establishment */}
          {currentStep === 1 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <Factory className="h-4 w-4 shrink-0 text-teal-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Odeeffannoo Indastrii<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Establishment information</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Basic details about the industrial establishment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="establishmentName" en={label('establishmentName').en} or={label('establishmentName').or} required={req('establishmentName')} />
                  <Input id="establishmentName" name="establishmentName" placeholder="e.g., BISHOFTU FLOUR MILL" value={formData.establishmentName} onChange={handleChange} required className="text-sm sm:text-base" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="sector" en={label('sector').en} or={label('sector').or} required={req('sector')} />
                  <Select value={formData.sector} onValueChange={(v) => handleSelectChange('sector', v)}>
                    <SelectTrigger id="sector" className="text-sm sm:text-base"><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
                    <SelectContent className="max-h-64">{sectors.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
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
              </CardContent>
            </>
          )}

          {/* Step 2: Registration & Size */}
          {currentStep === 2 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <FileText className="h-4 w-4 shrink-0 text-teal-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Galmee fi Safiisaa<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Registration &amp; size</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">License, ownership and workforce details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                {shown('licenseNumber') && (
                  <div className="space-y-1.5 sm:space-y-2">
                    <FieldLabel id="licenseNumber" en={label('licenseNumber').en} or={label('licenseNumber').or} required={req('licenseNumber')} />
                    <Input id="licenseNumber" name="licenseNumber" placeholder="e.g., BW/IC/2015/0234" value={formData.licenseNumber} onChange={handleChange} className="text-sm sm:text-base" />
                  </div>
                )}
                {shown('ownershipType') && (
                  <div className="space-y-1.5 sm:space-y-2">
                    <FieldLabel id="ownershipType" en={label('ownershipType').en} or={label('ownershipType').or} required={req('ownershipType')} />
                    <RadioGroup value={formData.ownershipType} onValueChange={(v) => handleSelectChange('ownershipType', v)} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {OWNERSHIP_TYPES.map((t) => (
                        <div key={t} className="flex items-center space-x-2 rounded-lg border p-2.5 has-data-[state=checked]:border-teal-500 has-data-[state=checked]:bg-teal-50">
                          <RadioGroupItem value={t} id={`ownership-${t}`} />
                          <Label htmlFor={`ownership-${t}`} className="cursor-pointer text-xs sm:text-sm font-normal">{t}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <FieldLabel id="employeeCount" en={label('employeeCount').en} or={label('employeeCount').or} required={req('employeeCount')} />
                    <Input id="employeeCount" name="employeeCount" type="number" min="0" placeholder="e.g., 25" value={formData.employeeCount} onChange={handleChange} required className="text-sm sm:text-base" />
                  </div>
                  {shown('startupCapital') && (
                    <div className="space-y-1.5 sm:space-y-2">
                      <FieldLabel id="startupCapital" en={label('startupCapital').en} or={label('startupCapital').or} required={req('startupCapital')} />
                      <Input id="startupCapital" name="startupCapital" type="number" min="0" placeholder="e.g., 500000" value={formData.startupCapital} onChange={handleChange} className="text-sm sm:text-base" />
                    </div>
                  )}
                </div>
                {/* Employees by sex (male / female) — admin can hide this question */}
                {shown('employeeSex') && (
                  <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel id="maleEmployees" en={label('employeeSex').en} or={label('employeeSex').or} />
                      <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[9px] font-medium text-teal-700 sm:text-[10px]">Optional / Filannoo</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="maleEmployees" className="text-xs">Male / Dhiira</Label>
                        <Input id="maleEmployees" name="maleEmployees" type="number" min="0" placeholder="e.g., 12" value={formData.maleEmployees} onChange={handleSexChange} className="text-sm sm:text-base" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="femaleEmployees" className="text-xs">Female / Dubartii</Label>
                        <Input id="femaleEmployees" name="femaleEmployees" type="number" min="0" placeholder="e.g., 13" value={formData.femaleEmployees} onChange={handleSexChange} className="text-sm sm:text-base" />
                      </div>
                    </div>
                    <p className="text-[10px] leading-snug text-muted-foreground">Male + Female should equal the Employee Count — leave empty if not known / Dhiira fi Dubartii lakkoofsa waliigalaa wajjin wal qabachuu qabu</p>
                  </div>
                )}
                {/* Environmental compliance — admin can hide either question */}
                {(shown('hasEia') || shown('hasEmp')) && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                    {shown('hasEia') && (
                      <div className="space-y-1.5 sm:space-y-2">
                        <FieldLabel id="eia-yes" en={label('hasEia').en} or={label('hasEia').or} />
                        <RadioGroup value={formData.hasEia} onValueChange={(v) => handleSelectChange('hasEia', v)} className="flex gap-4">
                          <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-teal-500 has-data-[state=checked]:bg-teal-50">
                            <RadioGroupItem value="yes" id="eia-yes" />
                            <Label htmlFor="eia-yes" className="cursor-pointer text-xs sm:text-sm">Yes / Eyee</Label>
                          </div>
                          <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-teal-500 has-data-[state=checked]:bg-teal-50">
                            <RadioGroupItem value="no" id="eia-no" />
                            <Label htmlFor="eia-no" className="cursor-pointer text-xs sm:text-sm">No / Lakki</Label>
                          </div>
                        </RadioGroup>
                        {formData.hasEia === 'yes' && shown('eiaApprovalDate') && (
                          <div className="space-y-1.5">
                            <FieldLabel id="eiaApprovalDate" en={label('eiaApprovalDate').en} or={label('eiaApprovalDate').or} required={req('eiaApprovalDate')} />
                            <Input id="eiaApprovalDate" name="eiaApprovalDate" type="date" value={formData.eiaApprovalDate} onChange={handleChange} className="text-sm sm:text-base" />
                          </div>
                        )}
                      </div>
                    )}
                    {shown('hasEmp') && (
                      <div className="space-y-1.5 sm:space-y-2">
                        <FieldLabel id="emp-yes" en={label('hasEmp').en} or={label('hasEmp').or} />
                        <RadioGroup value={formData.hasEmp} onValueChange={(v) => handleSelectChange('hasEmp', v)} className="flex gap-4">
                          <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-teal-500 has-data-[state=checked]:bg-teal-50">
                            <RadioGroupItem value="yes" id="emp-yes" />
                            <Label htmlFor="emp-yes" className="cursor-pointer text-xs sm:text-sm">Yes / Eyee</Label>
                          </div>
                          <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-teal-500 has-data-[state=checked]:bg-teal-50">
                            <RadioGroupItem value="no" id="emp-no" />
                            <Label htmlFor="emp-no" className="cursor-pointer text-xs sm:text-sm">No / Lakki</Label>
                          </div>
                        </RadioGroup>
                        {formData.hasEmp === 'yes' && shown('empApprovalDate') && (
                          <div className="space-y-1.5">
                            <FieldLabel id="empApprovalDate" en={label('empApprovalDate').en} or={label('empApprovalDate').or} required={req('empApprovalDate')} />
                            <Input id="empApprovalDate" name="empApprovalDate" type="date" value={formData.empApprovalDate} onChange={handleChange} className="text-sm sm:text-base" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* Current operational status — Active / Inactive radio question */}
                {shown('currentStatus') && (
                  <div className="space-y-1.5 sm:space-y-2">
                    <FieldLabel id="status-active" en={label('currentStatus').en} or={label('currentStatus').or} required={req('currentStatus')} />
                    <RadioGroup value={formData.currentStatus} onValueChange={(v) => handleSelectChange('currentStatus', v)} className="flex gap-4">
                      <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-teal-500 has-data-[state=checked]:bg-teal-50">
                        <RadioGroupItem value="ACTIVE" id="status-active" />
                        <Label htmlFor="status-active" className="cursor-pointer text-xs sm:text-sm">Active</Label>
                      </div>
                      <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-amber-500 has-data-[state=checked]:bg-amber-50">
                        <RadioGroupItem value="INACTIVE" id="status-inactive" />
                        <Label htmlFor="status-inactive" className="cursor-pointer text-xs sm:text-sm">Inactive</Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}
              </CardContent>
            </>
          )}

          {/* Step 3: Contact */}
          {currentStep === 3 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <UserCircle className="h-4 w-4 shrink-0 text-teal-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Odeeffannoo Quunnamtii<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Contact information</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Who we can reach about this establishment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="contactName" en={label('contactName').en} or={label('contactName').or} required={req('contactName')} />
                  <Input id="contactName" name="contactName" placeholder="Full name of manager / owner" value={formData.contactName} onChange={handleChange} required className="text-sm sm:text-base" />
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
                  <Eye className="h-4 w-4 shrink-0 text-teal-600 sm:h-5 sm:w-5" />
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
                      <RadioGroupItem value="yes" id="confirm-yes" />
                      <Label htmlFor="confirm-yes" className="cursor-pointer text-xs sm:text-sm">Yes / Eyee</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="confirm-no" />
                      <Label htmlFor="confirm-no" className="cursor-pointer text-xs sm:text-sm">No / Lakki</Label>
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
            <Button type="button" onClick={nextStep} className="flex-[2] bg-teal-600 text-sm text-white hover:bg-teal-700 sm:text-base">
              Next / Itti fufi
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting} className="flex-[2] bg-teal-600 text-sm text-white hover:bg-teal-700 sm:text-base">
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
