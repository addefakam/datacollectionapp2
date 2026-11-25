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
  GraduationCap,
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
import { EDUCATION_INSTITUTION_TYPES, EDUCATION_OWNERSHIP_TYPES, normalizeInstitutionTypes } from '@/lib/location-data';
import { useSettings } from '@/components/SettingsProvider';
import { InstitutionTypeMultiSelect } from './InstitutionTypeMultiSelect';
import {
  sectorSurveyFieldEnabled,
  sectorSurveyFieldRequired,
  sectorSurveyFieldsDefault,
  type SurveyFieldConfig,
} from '@/lib/survey-fields';

interface EducationSurveyFormProps {
  onSubmit: () => void;
  surveyorName: string;
  surveyorId: string;
  isOnline?: boolean;
  onOfflineSave?: (data: Record<string, unknown>) => Promise<boolean>;
}

const STEPS = [
  { id: 1, title: 'Institution', titleOr: 'Mana Barumsaa', icon: GraduationCap },
  { id: 2, title: 'Capacity', titleOr: 'Dandeettii', icon: FileText },
  { id: 3, title: 'Contact', titleOr: 'Quunnamtii', icon: Phone },
  { id: 4, title: 'Review', titleOr: 'Mirkanaa', icon: Eye },
];

const SERVICE_FIELDS: { name: string; label: string; labelOr: string; hint: string }[] = [
  { name: 'hasLibrary', label: 'Library service', labelOr: 'Mana Maxxantaa', hint: 'Library or reading room' },
  { name: 'hasLaboratory', label: 'Laboratory service', labelOr: 'Laboratoire', hint: 'Science laboratory' },
  { name: 'hasComputerLab', label: 'Computer lab', labelOr: 'Kompiyuutaraa', hint: 'Computer or ICT lab' },
  { name: 'hasFeedingProgram', label: 'Feeding program', labelOr: 'Soorataa', hint: 'School meals program' },
];

/** Uniform question label: admin-managed English label + Afaan Oromoo sub-label + required star. */
function FieldLabel({ id, en, or, required, hint }: { id: string; en: string; or?: string; required?: boolean; hint?: string }) {
  return (
    <Label htmlFor={id} className="text-xs sm:text-sm">
      {en}
      {or ? (<><br /><span className="text-xs font-normal text-muted-foreground">{or}</span></>) : null}
      {hint ? (<span className="block text-[10px] font-normal text-muted-foreground sm:text-xs">{hint}</span>) : null}
      {required ? <span className="text-red-500"> *</span> : null}
    </Label>
  );
}

export default function EducationSurveyForm({
  onSubmit,
  surveyorName,
  surveyorId,
  isOnline = true,
  onOfflineSave,
}: EducationSurveyFormProps) {
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
    sectorSurveyFieldsDefault('education')
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/survey-fields/education')
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
  const shown = (key: string) => sectorSurveyFieldEnabled('education', fields, key);
  const req = (key: string) => sectorSurveyFieldRequired('education', fields, key);
  const label = (key: string) => {
    const f = fields.find((x) => x.key === key);
    return { en: f?.labelEn ?? key, or: f?.labelOr ?? '' };
  };

  const emptyForm = {
    institutionName: '',
    institutionTypes: [] as string[],
    ownershipType: '',
    subCity: '',
    area: '',
    specificAddress: '',
    licenseNumber: '',
    studentCount: '',
    maleStudents: '',
    femaleStudents: '',
    teacherCount: '',
    maleTeachers: '',
    femaleTeachers: '',
    classroomCount: '',
    hasLibrary: 'no',
    hasLaboratory: 'no',
    hasComputerLab: 'no',
    hasFeedingProgram: 'no',
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
   * is still empty, auto-fill the total with their sum (students and teachers).
   */
  const handleSexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value } as typeof prev;
      if (name === 'maleStudents' || name === 'femaleStudents') {
        const male = name === 'maleStudents' ? value : next.maleStudents;
        const female = name === 'femaleStudents' ? value : next.femaleStudents;
        if (next.studentCount === '' && male !== '' && female !== '') {
          const sum = Number(male) + Number(female);
          if (Number.isFinite(sum) && sum >= 0) return { ...next, studentCount: String(sum) };
        }
      }
      if (name === 'maleTeachers' || name === 'femaleTeachers') {
        const male = name === 'maleTeachers' ? value : next.maleTeachers;
        const female = name === 'femaleTeachers' ? value : next.femaleTeachers;
        if (next.teacherCount === '' && male !== '' && female !== '') {
          const sum = Number(male) + Number(female);
          if (Number.isFinite(sum) && sum >= 0) return { ...next, teacherCount: String(sum) };
        }
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
        const missing = missingRequired(['institutionName', 'subCity', 'area', 'specificAddress']);
        if (missing || formData.institutionTypes.length === 0) {
          toast({ title: 'Field Missing / Qabiyyee Hin Jiru', description: `Required: ${missing || label('institutionTypes').en} / Barbaachisaadha`, variant: 'destructive' });
          return false;
        }
        return true;
      }
      case 2: {
        const missing = missingRequired(['ownershipType', 'teacherCount', 'classroomCount']);
        if (missing) {
          toast({ title: 'Field Missing / Qabiyyee Hin Jiru', description: `Required: ${missing} / Barbaachisaadha`, variant: 'destructive' });
          return false;
        }
        if (!formData.studentCount || Number(formData.studentCount) < 0) {
          toast({ title: 'Invalid Student Count / Lakkoofsa Barataa Dogoggora', description: 'Enter a valid student count / Lakkoofsa barataa sirrii galchi', variant: 'destructive' });
          return false;
        }
        if (shown('teacherCount') && formData.teacherCount !== '' && Number(formData.teacherCount) < 0) {
          toast({ title: 'Invalid Teacher Count / Lakkoofsa Barsiisaa Dogoggora', description: 'Enter a valid teacher count / Lakkoofsa barsiisaa sirrii galchi', variant: 'destructive' });
          return false;
        }
        if (shown('classroomCount') && formData.classroomCount !== '' && Number(formData.classroomCount) < 0) {
          toast({ title: 'Invalid Classroom Count', description: 'Enter a valid classroom count (0 or more)', variant: 'destructive' });
          return false;
        }
        if (shown('studentsSex') && !validateSexPair(formData.maleStudents, formData.femaleStudents, formData.studentCount, 'Student Count')) return false;
        if (shown('teachersSex') && !validateSexPair(formData.maleTeachers, formData.femaleTeachers, formData.teacherCount, 'Teacher Count')) return false;
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
      institutionType: normalizeInstitutionTypes(formData.institutionTypes),
      studentCount: Number(formData.studentCount || 0),
      maleStudents: formData.maleStudents === '' ? 0 : Number(formData.maleStudents),
      femaleStudents: formData.femaleStudents === '' ? 0 : Number(formData.femaleStudents),
      teacherCount: Number(formData.teacherCount || 0),
      maleTeachers: formData.maleTeachers === '' ? 0 : Number(formData.maleTeachers),
      femaleTeachers: formData.femaleTeachers === '' ? 0 : Number(formData.femaleTeachers),
      classroomCount: Number(formData.classroomCount || 0),
      hasLibrary: formData.hasLibrary === 'yes',
      hasLaboratory: formData.hasLaboratory === 'yes',
      hasComputerLab: formData.hasComputerLab === 'yes',
      hasFeedingProgram: formData.hasFeedingProgram === 'yes',
      surveyorName,
      surveyorId,
    };
    setIsSubmitting(true);
    if (isOnline) {
      try {
        const response = await fetch('/api/educationcenters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          if (response.status >= 400 && response.status < 500) {
            // Server permanently rejected the record (validation) — queueing it offline would never succeed.
            toast({ title: 'Submission Rejected / Galmeen Morkame', description: err.error || 'Please correct the highlighted fields and submit again', variant: 'destructive' });
            return;
          }
          throw new Error(err.error || 'Server unavailable');
        }
        toast({ title: 'Survey Submitted! / Galma Qabame!', description: `${formData.institutionName} recorded successfully / galmeen safiisan argame` });
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
      shown('institutionName') && { label: 'Institution / Mana Barumsaa', value: formData.institutionName },
      shown('institutionTypes') && { label: 'Institution Type / Gosa', value: formData.institutionTypes.join(', ') },
      shown('ownershipType') && { label: 'Ownership / Abbaa Qabuu', value: formData.ownershipType },
      shown('subCity') && { label: 'Sub-City / Kuttaa Maggalaa', value: formData.subCity },
      shown('area') && { label: 'Werreda', value: formData.area },
      shown('specificAddress') && { label: 'Address / Baka Addaa', value: formData.specificAddress },
      shown('licenseNumber') && { label: 'License No. / Lakofsaa Eyyeema', value: formData.licenseNumber || '—' },
      shown('studentCount') && { label: 'Students / Barataa', value: formData.studentCount },
      shown('studentsSex') && { label: 'Male Students / Barataa Dhiiraa', value: formData.maleStudents === '' ? '—' : formData.maleStudents },
      shown('studentsSex') && { label: 'Female Students / Barattii Dubartii', value: formData.femaleStudents === '' ? '—' : formData.femaleStudents },
      shown('teacherCount') && { label: 'Teachers / Barsiisaa', value: formData.teacherCount },
      shown('teachersSex') && { label: 'Male Teachers / Barsiisaa Dhiiraa', value: formData.maleTeachers === '' ? '—' : formData.maleTeachers },
      shown('teachersSex') && { label: 'Female Teachers / Dubartii Barsiisaa', value: formData.femaleTeachers === '' ? '—' : formData.femaleTeachers },
      shown('classroomCount') && { label: 'Classrooms', value: formData.classroomCount === '' ? '0' : formData.classroomCount },
      shown('hasLibrary') && { label: 'Library', value: formData.hasLibrary === 'yes' ? 'Yes / Eyee' : 'No / Lakki' },
      shown('hasLaboratory') && { label: 'Laboratory', value: formData.hasLaboratory === 'yes' ? 'Yes / Eyee' : 'No / Lakki' },
      shown('hasComputerLab') && { label: 'Computer Lab', value: formData.hasComputerLab === 'yes' ? 'Yes / Eyee' : 'No / Lakki' },
      shown('hasFeedingProgram') && { label: 'Feeding Program', value: formData.hasFeedingProgram === 'yes' ? 'Yes / Eyee' : 'No / Lakki' },
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
                    isActive ? 'bg-indigo-600 text-white shadow-md sm:shadow-lg sm:shadow-indigo-100'
                      : isCompleted ? 'bg-indigo-100 text-indigo-700 cursor-pointer'
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full sm:h-8 sm:w-8 ${isCompleted ? 'bg-indigo-600 text-white' : ''}`}>
                    {isCompleted ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  </div>
                  <span className="text-[9px] leading-tight font-medium text-center truncate w-full sm:text-[10px]">{step.title}</span>
                  <span className="hidden text-[8px] leading-tight text-center opacity-75 truncate w-full sm:block sm:text-[9px]">{step.titleOr}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`mx-0.5 h-0.5 flex-1 rounded sm:mx-1 ${currentStep > step.id ? 'bg-indigo-500' : 'bg-gray-200'}`} />
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
          {/* Step 1: Institution */}
          {currentStep === 1 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <GraduationCap className="h-4 w-4 shrink-0 text-indigo-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Odeeffannoo Mana Barumsaa<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Education institution information</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Basic details about the education institution</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="e-institutionName" en={label('institutionName').en} or={label('institutionName').or} required={req('institutionName')} />
                  <Input id="e-institutionName" name="institutionName" placeholder="e.g., BISHOFTU PRIMARY SCHOOL" value={formData.institutionName} onChange={handleChange} required className="text-sm sm:text-base" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="e-institutionType" en={label('institutionTypes').en} or={label('institutionTypes').or} required={req('institutionTypes')} hint="Select all that apply — an institution may run several levels / Filachuuf ni dandeessu" />
                  <InstitutionTypeMultiSelect
                    id="e-institutionType"
                    selected={formData.institutionTypes}
                    onChange={(types) => setFormData((prev) => ({ ...prev, institutionTypes: types }))}
                    options={EDUCATION_INSTITUTION_TYPES}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <FieldLabel id="e-subCity" en={label('subCity').en} or={label('subCity').or} required={req('subCity')} />
                    <Select value={formData.subCity} onValueChange={handleSubCityChange}>
                      <SelectTrigger id="e-subCity" className="text-sm sm:text-base"><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
                      <SelectContent>{subCities.map((sc) => (<SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <FieldLabel id="e-area" en={label('area').en} or={label('area').or} required={req('area')} />
                    <Select value={formData.area} onValueChange={(v) => handleSelectChange('area', v)} disabled={!selectedSubCity}>
                      <SelectTrigger id="e-area" className="text-sm sm:text-base"><SelectValue placeholder={selectedSubCity ? 'Select / Filadhu' : 'Select sub-city first'} /></SelectTrigger>
                      <SelectContent>{areas.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                {shown('specificAddress') && (
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="e-specificAddress" en={label('specificAddress').en} or={label('specificAddress').or} required={req('specificAddress')} />
                  <Input id="e-specificAddress" name="specificAddress" placeholder="Landmark, street, plot number" value={formData.specificAddress} onChange={handleChange} className="text-sm sm:text-base" />
                </div>
                )}
              </CardContent>
            </>
          )}

          {/* Step 2: Capacity & Services */}
          {currentStep === 2 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <FileText className="h-4 w-4 shrink-0 text-indigo-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Dandeettii fi Tajaajila<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Capacity &amp; services</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">License, ownership, students and available services</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                {shown('licenseNumber') && (
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="e-licenseNumber" en={label('licenseNumber').en} or={label('licenseNumber').or} required={req('licenseNumber')} />
                  <Input id="e-licenseNumber" name="licenseNumber" placeholder="e.g., ED/2015/0234" value={formData.licenseNumber} onChange={handleChange} className="text-sm sm:text-base" />
                </div>
                )}
                {shown('ownershipType') && (
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="e-ownershipType" en={label('ownershipType').en} or={label('ownershipType').or} required={req('ownershipType')} />
                  <RadioGroup value={formData.ownershipType} onValueChange={(v) => handleSelectChange('ownershipType', v)} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {EDUCATION_OWNERSHIP_TYPES.map((t) => (
                      <div key={t} className="flex items-center space-x-2 rounded-lg border p-2.5 has-data-[state=checked]:border-indigo-500 has-data-[state=checked]:bg-indigo-50">
                        <RadioGroupItem value={t} id={`e-ownership-${t}`} />
                        <Label htmlFor={`e-ownership-${t}`} className="cursor-pointer text-xs sm:text-sm font-normal">{t}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <FieldLabel id="e-studentCount" en={label('studentCount').en} or={label('studentCount').or} required={req('studentCount')} />
                    <Input id="e-studentCount" name="studentCount" type="number" min="0" placeholder="e.g., 850" value={formData.studentCount} onChange={handleChange} required className="text-sm sm:text-base" />
                  </div>
                  {shown('teacherCount') && (
                  <div className="space-y-1.5 sm:space-y-2">
                    <FieldLabel id="e-teacherCount" en={label('teacherCount').en} or={label('teacherCount').or} required={req('teacherCount')} />
                    <Input id="e-teacherCount" name="teacherCount" type="number" min="0" placeholder="e.g., 24" value={formData.teacherCount} onChange={handleChange} className="text-sm sm:text-base" />
                  </div>
                  )}
                </div>
                {/* Students by sex (male / female) */}
                {shown('studentsSex') && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs sm:text-sm">{label('studentsSex').en}<br /><span className="text-xs font-normal text-muted-foreground">{label('studentsSex').or}</span></Label>
                    <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-medium text-indigo-700 sm:text-[10px]">Optional / Filannoo</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="e-maleStudents" className="text-xs">Male / Dhiiraa</Label>
                      <Input id="e-maleStudents" name="maleStudents" type="number" min="0" placeholder="e.g., 430" value={formData.maleStudents} onChange={handleSexChange} className="text-sm sm:text-base" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="e-femaleStudents" className="text-xs">Female / Dubartii</Label>
                      <Input id="e-femaleStudents" name="femaleStudents" type="number" min="0" placeholder="e.g., 420" value={formData.femaleStudents} onChange={handleSexChange} className="text-sm sm:text-base" />
                    </div>
                  </div>
                  <p className="text-[10px] leading-snug text-muted-foreground">Male + Female should equal the Student Count — leave empty if not known / Dhiira fi Dubartii lakkoofsa waliigalaa wajjin wal qabachuu qabu</p>
                </div>
                )}
                {/* Teachers by sex (male / female) */}
                {shown('teachersSex') && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs sm:text-sm">{label('teachersSex').en}<br /><span className="text-xs font-normal text-muted-foreground">{label('teachersSex').or}</span></Label>
                    <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-medium text-indigo-700 sm:text-[10px]">Optional / Filannoo</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="e-maleTeachers" className="text-xs">Male / Dhiiraa</Label>
                      <Input id="e-maleTeachers" name="maleTeachers" type="number" min="0" placeholder="e.g., 11" value={formData.maleTeachers} onChange={handleSexChange} className="text-sm sm:text-base" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="e-femaleTeachers" className="text-xs">Female / Dubartii</Label>
                      <Input id="e-femaleTeachers" name="femaleTeachers" type="number" min="0" placeholder="e.g., 13" value={formData.femaleTeachers} onChange={handleSexChange} className="text-sm sm:text-base" />
                    </div>
                  </div>
                  <p className="text-[10px] leading-snug text-muted-foreground">Male + Female should equal the Teacher Count — leave empty if not known / Dhiira fi Dubartii lakkoofsa waliigalaa wajjin wal qabachuu qabu</p>
                </div>
                )}
                {shown('classroomCount') && (
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="e-classroomCount" en={label('classroomCount').en} or={label('classroomCount').or} required={req('classroomCount')} />
                  <Input id="e-classroomCount" name="classroomCount" type="number" min="0" placeholder="e.g., 18" value={formData.classroomCount} onChange={handleChange} className="text-sm sm:text-base" />
                </div>
                )}
                {/* Available services */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  {SERVICE_FIELDS.filter((svc) => shown(svc.name)).map((svc) => (
                    <div key={svc.name} className="space-y-1.5 sm:space-y-2">
                      <Label className="text-xs sm:text-sm">{label(svc.name).en}<br /><span className="text-xs font-normal text-muted-foreground">{label(svc.name).or} — {svc.hint}</span></Label>
                      <RadioGroup value={formData[svc.name as keyof typeof formData] as string} onValueChange={(v) => handleSelectChange(svc.name, v)} className="flex gap-4">
                        <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-indigo-500 has-data-[state=checked]:bg-indigo-50">
                          <RadioGroupItem value="yes" id={`e-${svc.name}-yes`} />
                          <Label htmlFor={`e-${svc.name}-yes`} className="cursor-pointer text-xs sm:text-sm">Yes / Eyee</Label>
                        </div>
                        <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-indigo-500 has-data-[state=checked]:bg-indigo-50">
                          <RadioGroupItem value="no" id={`e-${svc.name}-no`} />
                          <Label htmlFor={`e-${svc.name}-no`} className="cursor-pointer text-xs sm:text-sm">No / Lakki</Label>
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
                  <UserCircle className="h-4 w-4 shrink-0 text-indigo-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Odeeffannoo Quunnamtii<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Contact information</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Who we can reach about this institution</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="e-contactName" en={label('contactName').en} or={label('contactName').or} required={req('contactName')} />
                  <Input id="e-contactName" name="contactName" placeholder="Full name of director / principal" value={formData.contactName} onChange={handleChange} required className="text-sm sm:text-base" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <FieldLabel id="e-contactPhone" en={label('contactPhone').en} or={label('contactPhone').or} required={req('contactPhone')} />
                  <Input id="e-contactPhone" name="contactPhone" type="tel" placeholder="+251 9X XXX XXXX or 09XXXXXXXX" value={formData.contactPhone} onChange={handleChange} required className="text-sm sm:text-base" />
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
                  <Eye className="h-4 w-4 shrink-0 text-indigo-600 sm:h-5 sm:w-5" />
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
                      <RadioGroupItem value="yes" id="e-confirm-yes" />
                      <Label htmlFor="e-confirm-yes" className="cursor-pointer text-xs sm:text-sm">Yes / Eyee</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="e-confirm-no" />
                      <Label htmlFor="e-confirm-no" className="cursor-pointer text-xs sm:text-sm">No / Lakki</Label>
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
            <Button type="button" onClick={nextStep} className="flex-[2] bg-indigo-600 text-sm text-white hover:bg-indigo-700 sm:text-base">
              Next / Itti fufi
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting} className="flex-[2] bg-indigo-600 text-sm text-white hover:bg-indigo-700 sm:text-base">
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
