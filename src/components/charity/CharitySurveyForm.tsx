'use client';

import { useState } from 'react';
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
  HeartHandshake,
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
import { CHARITY_TYPES, CHARITY_ORGANIZATION_TYPES } from '@/lib/location-data';
import { useSettings } from '@/components/SettingsProvider';

interface CharitySurveyFormProps {
  onSubmit: () => void;
  surveyorName: string;
  surveyorId: string;
  isOnline?: boolean;
  onOfflineSave?: (data: Record<string, unknown>) => Promise<boolean>;
}

const STEPS = [
  { id: 1, title: 'Organization', titleOr: 'Dhaabbata', icon: HeartHandshake },
  { id: 2, title: 'Reach', titleOr: 'Dandeettii', icon: FileText },
  { id: 3, title: 'Contact', titleOr: 'Quunnamtii', icon: Phone },
  { id: 4, title: 'Review', titleOr: 'Mirkanaa', icon: Eye },
];

export default function CharitySurveyForm({
  onSubmit,
  surveyorName,
  surveyorId,
  isOnline = true,
  onOfflineSave,
}: CharitySurveyFormProps) {
  const { toast } = useToast();
  const { subCities, areasFor } = useSettings();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedSubCity, setSelectedSubCity] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [dataConfirmed, setDataConfirmed] = useState('');

  const emptyForm = {
    organizationName: '',
    organizationType: '',
    charityType: '',
    subCity: '',
    area: '',
    specificAddress: '',
    registrationNumber: '',
    beneficiaryCount: '',
    maleBeneficiaries: '',
    femaleBeneficiaries: '',
    volunteerCount: '',
    annualBudget: '',
    hasLegalRegistration: 'no',
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
      const male = name === 'maleBeneficiaries' ? value : next.maleBeneficiaries;
      const female = name === 'femaleBeneficiaries' ? value : next.femaleBeneficiaries;
      if (next.beneficiaryCount === '' && male !== '' && female !== '') {
        const sum = Number(male) + Number(female);
        if (Number.isFinite(sum) && sum >= 0) return { ...next, beneficiaryCount: String(sum) };
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
    switch (step) {
      case 1:
        if (!formData.organizationName || !formData.charityType || !formData.subCity || !formData.area || !formData.specificAddress) {
          toast({ title: 'Field Missing / Qabiyyee Hin Jiru', description: 'All fields in this step are required / Galii hundinuu barbaachisaadha', variant: 'destructive' });
          return false;
        }
        return true;
      case 2:
        if (!formData.organizationType) {
          toast({ title: 'Field Missing / Qabiyyee Hin Jiru', description: 'Organization type is required / Gosa dhaabbataa barbaachisaadha', variant: 'destructive' });
          return false;
        }
        if (!formData.beneficiaryCount || Number(formData.beneficiaryCount) < 0) {
          toast({ title: 'Invalid Beneficiary Count / Lakkoofsa Daddachaa Dogoggora', description: 'Enter a valid beneficiary count / Lakkoofsa daddachaa sirrii galchi', variant: 'destructive' });
          return false;
        }
        if (!validateSexPair(formData.maleBeneficiaries, formData.femaleBeneficiaries, formData.beneficiaryCount, 'Beneficiary Count')) return false;
        if (formData.volunteerCount !== '' && (Number.isNaN(Number(formData.volunteerCount)) || Number(formData.volunteerCount) < 0)) {
          toast({ title: 'Invalid Volunteer Count / Lakkoofsa Volantiira Dogoggora', description: 'Volunteer count cannot be negative / Lakkoofsi volantiiraa diidaa hin qabaatu', variant: 'destructive' });
          return false;
        }
        if (formData.annualBudget !== '' && (Number.isNaN(Number(formData.annualBudget)) || Number(formData.annualBudget) < 0)) {
          toast({ title: 'Invalid Budget / Maallaqa Dogoggora', description: 'Annual budget cannot be negative / Maallaqa waggaa diidaa hin qabaatu', variant: 'destructive' });
          return false;
        }
        return true;
      case 3:
        if (!formData.contactName || !formData.contactPhone) {
          toast({ title: 'Field Missing / Qabiyyee Hin Jiru', description: 'Contact person and phone are required / Maqaa fi bilbila quunnamtii barbaachisa', variant: 'destructive' });
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
      beneficiaryCount: Number(formData.beneficiaryCount || 0),
      maleBeneficiaries: formData.maleBeneficiaries === '' ? 0 : Number(formData.maleBeneficiaries),
      femaleBeneficiaries: formData.femaleBeneficiaries === '' ? 0 : Number(formData.femaleBeneficiaries),
      volunteerCount: formData.volunteerCount === '' ? 0 : Number(formData.volunteerCount),
      annualBudget: formData.annualBudget === '' ? null : Number(formData.annualBudget),
      hasLegalRegistration: formData.hasLegalRegistration === 'yes',
      surveyorName,
      surveyorId,
    };
    setIsSubmitting(true);
    if (isOnline) {
      try {
        const response = await fetch('/api/charities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Failed to submit'); }
        toast({ title: 'Survey Submitted! / Galma Qabame!', description: `${formData.organizationName} recorded successfully / galmeen safiisan argame` });
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

  const reviewItems = [
    { label: 'Organization / Dhaabbata', value: formData.organizationName },
    { label: 'Organization Type', value: formData.organizationType },
    { label: 'Charity Type / Gosa', value: formData.charityType },
    { label: 'Sub-City / Kututtaa Maggalaa', value: formData.subCity },
    { label: 'Werreda', value: formData.area },
    { label: 'Address / Baka Addaa', value: formData.specificAddress },
    { label: 'Registration No.', value: formData.registrationNumber || '—' },
    { label: 'Beneficiaries / Daddachaa', value: formData.beneficiaryCount },
    { label: 'Male / Dhiira', value: formData.maleBeneficiaries === '' ? '—' : formData.maleBeneficiaries },
    { label: 'Female / Dubartii', value: formData.femaleBeneficiaries === '' ? '—' : formData.femaleBeneficiaries },
    { label: 'Volunteers', value: formData.volunteerCount === '' ? '—' : formData.volunteerCount },
    { label: 'Annual Budget (ETB)', value: formData.annualBudget === '' ? '—' : formData.annualBudget },
    { label: 'Legally Registered', value: formData.hasLegalRegistration === 'yes' ? 'Yes / Eyee' : 'No / Lakki' },
    { label: 'Contact / Quunnamtii', value: `${formData.contactName} — ${formData.contactPhone}` },
  ];

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
          {/* Step 1: Organization */}
          {currentStep === 1 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <HeartHandshake className="h-4 w-4 shrink-0 text-amber-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Odeeffannoo Dhaabbata<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Charity organization information</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Basic details about the charity organization (Bussa Goonofa)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="organizationName" className="text-xs sm:text-sm">Organization Name <span className="text-red-500">*</span></Label>
                  <Input id="organizationName" name="organizationName" placeholder="e.g., HOPE ORPHAN SUPPORT CENTER" value={formData.organizationName} onChange={handleChange} required className="text-sm sm:text-base" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="charityType" className="text-xs sm:text-sm">Charity Type / Gosa Daawwattii <span className="text-red-500">*</span></Label>
                  <Select value={formData.charityType} onValueChange={(v) => handleSelectChange('charityType', v)}>
                    <SelectTrigger id="charityType" className="text-sm sm:text-base"><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
                    <SelectContent className="max-h-64">{CHARITY_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="subCity" className="text-xs sm:text-sm">Sub-City<br /><span className="text-xs font-normal text-muted-foreground">Kuttaa Maggalaa</span> <span className="text-red-500">*</span></Label>
                    <Select value={formData.subCity} onValueChange={handleSubCityChange}>
                      <SelectTrigger id="subCity" className="text-sm sm:text-base"><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
                      <SelectContent>{subCities.map((sc) => (<SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="area" className="text-xs sm:text-sm">Werreda <span className="text-red-500">*</span></Label>
                    <Select value={formData.area} onValueChange={(v) => handleSelectChange('area', v)} disabled={!selectedSubCity}>
                      <SelectTrigger id="area" className="text-sm sm:text-base"><SelectValue placeholder={selectedSubCity ? 'Select / Filadhu' : 'Select sub-city first'} /></SelectTrigger>
                      <SelectContent>{areas.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="specificAddress" className="text-xs sm:text-sm">Specific Address<br /><span className="text-xs font-normal text-muted-foreground">Baka Addaa</span> <span className="text-red-500">*</span></Label>
                  <Input id="specificAddress" name="specificAddress" placeholder="Landmark, street, plot number" value={formData.specificAddress} onChange={handleChange} required className="text-sm sm:text-base" />
                </div>
              </CardContent>
            </>
          )}

          {/* Step 2: Reach & Registration */}
          {currentStep === 2 && (
            <>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                  <FileText className="h-4 w-4 shrink-0 text-amber-600 sm:h-5 sm:w-5" />
                  <span className="leading-tight">Dandeettii fi Daddachaa<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Reach &amp; registration</span></span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Registration, beneficiaries, volunteers and budget</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">Organization Type / Gosa Dhaabbataa <span className="text-red-500">*</span></Label>
                  <RadioGroup value={formData.organizationType} onValueChange={(v) => handleSelectChange('organizationType', v)} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {CHARITY_ORGANIZATION_TYPES.map((t) => (
                      <div key={t} className="flex items-center space-x-2 rounded-lg border p-2.5 has-data-[state=checked]:border-amber-500 has-data-[state=checked]:bg-amber-50">
                        <RadioGroupItem value={t} id={`charity-org-${t}`} />
                        <Label htmlFor={`charity-org-${t}`} className="cursor-pointer text-xs sm:text-sm font-normal">{t}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="registrationNumber" className="text-xs sm:text-sm">Registration Number<br /><span className="text-xs font-normal text-muted-foreground">Lakofsaa Galmeessaa</span></Label>
                    <Input id="registrationNumber" name="registrationNumber" placeholder="e.g., REG/2024/012" value={formData.registrationNumber} onChange={handleChange} className="text-sm sm:text-base" />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-xs sm:text-sm">Legally Registered<br /><span className="text-xs font-normal text-muted-foreground">Seeraan Galmeffame</span></Label>
                    <RadioGroup value={formData.hasLegalRegistration} onValueChange={(v) => handleSelectChange('hasLegalRegistration', v)} className="flex gap-4">
                      <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-amber-500 has-data-[state=checked]:bg-amber-50">
                        <RadioGroupItem value="yes" id="hasLegalRegistration-yes" />
                        <Label htmlFor="hasLegalRegistration-yes" className="cursor-pointer text-xs sm:text-sm">Yes / Eyee</Label>
                      </div>
                      <div className="flex items-center space-x-2 rounded-lg border px-3 py-2 has-data-[state=checked]:border-amber-500 has-data-[state=checked]:bg-amber-50">
                        <RadioGroupItem value="no" id="hasLegalRegistration-no" />
                        <Label htmlFor="hasLegalRegistration-no" className="cursor-pointer text-xs sm:text-sm">No / Lakki</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="beneficiaryCount" className="text-xs sm:text-sm">Beneficiary Count<br /><span className="text-xs font-normal text-muted-foreground">Lakkoofsa Daddachaa</span> <span className="text-red-500">*</span></Label>
                  <Input id="beneficiaryCount" name="beneficiaryCount" type="number" min="0" placeholder="e.g., 120" value={formData.beneficiaryCount} onChange={handleChange} required className="text-sm sm:text-base" />
                </div>
                {/* Beneficiaries by sex (male / female) */}
                <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs sm:text-sm">Beneficiaries by Sex<br /><span className="text-xs font-normal text-muted-foreground">Daddachaa Dhiira fi Dubartii</span></Label>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-medium text-amber-700 sm:text-[10px]">Optional / Filannoo</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="maleBeneficiaries" className="text-xs">Male / Dhiira</Label>
                      <Input id="maleBeneficiaries" name="maleBeneficiaries" type="number" min="0" placeholder="e.g., 55" value={formData.maleBeneficiaries} onChange={handleSexChange} className="text-sm sm:text-base" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="femaleBeneficiaries" className="text-xs">Female / Dubartii</Label>
                      <Input id="femaleBeneficiaries" name="femaleBeneficiaries" type="number" min="0" placeholder="e.g., 65" value={formData.femaleBeneficiaries} onChange={handleSexChange} className="text-sm sm:text-base" />
                    </div>
                  </div>
                  <p className="text-[10px] leading-snug text-muted-foreground">Male + Female should equal the Beneficiary Count — leave empty if not known / Dhiira fi Dubartii lakkoofsa waliigalaa wajjin wal qabachuu qabu</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="volunteerCount" className="text-xs sm:text-sm">Volunteer Count<br /><span className="text-xs font-normal text-muted-foreground">Lakkoofsa Volantiiraa</span></Label>
                    <Input id="volunteerCount" name="volunteerCount" type="number" min="0" placeholder="e.g., 15" value={formData.volunteerCount} onChange={handleChange} className="text-sm sm:text-base" />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="annualBudget" className="text-xs sm:text-sm">Annual Budget (ETB)<br /><span className="text-xs font-normal text-muted-foreground">Maallaqa Waggaa</span></Label>
                    <Input id="annualBudget" name="annualBudget" type="number" min="0" step="any" placeholder="e.g., 250000" value={formData.annualBudget} onChange={handleChange} className="text-sm sm:text-base" />
                  </div>
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
                <CardDescription className="text-xs sm:text-sm">Who we can reach about this organization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="contactName" className="text-xs sm:text-sm">Contact Person<br /><span className="text-xs font-normal text-muted-foreground">Nama Quunnamtu</span> <span className="text-red-500">*</span></Label>
                  <Input id="contactName" name="contactName" placeholder="Full name of manager / coordinator" value={formData.contactName} onChange={handleChange} required className="text-sm sm:text-base" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="contactPhone" className="text-xs sm:text-sm">Contact Phone<br /><span className="text-xs font-normal text-muted-foreground">Bilbila Quunnamtii</span> <span className="text-red-500">*</span></Label>
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
                      <RadioGroupItem value="yes" id="charity-confirm-yes" />
                      <Label htmlFor="charity-confirm-yes" className="cursor-pointer text-xs sm:text-sm">Yes / Eyee</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="charity-confirm-no" />
                      <Label htmlFor="charity-confirm-no" className="cursor-pointer text-xs sm:text-sm">No / Lakki</Label>
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
