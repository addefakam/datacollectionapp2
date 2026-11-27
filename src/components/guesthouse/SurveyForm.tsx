'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  Loader2,
  RotateCcw,
  Check,
  UserCircle,
  Phone,
  FileText,
  Eye,
  ShieldCheck,
  PhoneIncoming,
} from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import { LICENSE_TYPES, LICENSE_LEVELS } from '@/lib/location-data';
import { useSettings } from '@/components/SettingsProvider';
import {
  sanitizeCustomAnswers,
  sectorSurveyFieldEnabled,
  sectorSurveyFieldRequired,
  sectorSurveyFieldsDefault,
  type SurveyFieldConfig,
} from '@/lib/survey-fields';
import {
  CustomQuestionField,
  customQuestionsForStep,
  customReviewRows,
  customStepIssue,
} from '@/components/shared/custom-survey-fields';
import {
  SurveyProgress,
  SurveySectionHeader,
  SurveyFieldLabel,
  SurveyReviewTable,
  SurveyNav,
  surveyInputClass,
  surveySelectClass,
} from '@/components/shared/survey-ui';

interface SurveyFormProps {
  onSubmit: () => void;
  surveyorName: string;
  surveyorId: string;
  isOnline?: boolean;
  onOfflineSave?: (data: Record<string, unknown>) => Promise<boolean>;
}

const STEPS = [
  { id: 1, title: 'Establishment', titleOr: 'Qophiin', icon: Building2 },
  { id: 2, title: 'License', titleOr: 'Laisansii', icon: FileText },
  { id: 3, title: 'Contact', titleOr: 'Quunnamtii', icon: Phone },
  { id: 4, title: 'Review', titleOr: 'Mirkanaa', icon: Eye },
];

export default function SurveyForm({ onSubmit, surveyorName, surveyorId, isOnline = true, onOfflineSave }: SurveyFormProps) {
  const { subCities, areasFor } = useSettings();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedSubCity, setSelectedSubCity] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [dataConfirmed, setDataConfirmed] = useState('');
  const signaturePadRef = useRef<SignaturePadHandle>(null);

  // Admin-managed questionnaire (Manage workspace → Survey Questions);
  // registry defaults until it loads (offline keeps the defaults).
  const [fields, setFields] = useState<SurveyFieldConfig[]>(() =>
    sectorSurveyFieldsDefault('guesthouse')
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/survey-fields/guesthouse')
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
  const shown = (key: string) => sectorSurveyFieldEnabled('guesthouse', fields, key);
  const req = (key: string) => sectorSurveyFieldRequired('guesthouse', fields, key);
  const label = (key: string) => {
    const f = fields.find((x) => x.key === key);
    return { en: f?.labelEn ?? key, or: f?.labelOr ?? '' };
  };

  // Admin-added custom questionnaire questions (Administration → Settings →
  // Survey / Manage → Survey Questions) — answers live on the record.
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const setCustom = (key: string, v: string) => setCustomAnswers((cur) => ({ ...cur, [key]: v }));

  const emptyForm = {
    guestHouseName: '',
    organizationName: '',
    subCity: '',
    area: '',
    specificAddress: '',
    numberOfRooms: '',
    licenseType: '',
    licenseLevel: '',
    licenseNumber: '',
    contactPhone: '',
    contactName: '',
    contactPhone2: '',
    contactName2: '',
    ownerName: '',
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

  const validateStep = (step: number): boolean => {
    /** Required/format checks for the admin-added custom questions of a step. */
    const checkCustom = (stepNo: number): boolean => {
      const issue = customStepIssue(fields, customAnswers, stepNo);
      if (!issue) return true;
      toast({
        title: issue.kind === 'missing' ? 'Field Missing / Qabiyyee Hin Jiru' : 'Invalid Answer / Deebii Dogoggora',
        description: issue.message,
        variant: 'destructive',
      });
      return false;
    };
    /** First missing required field of a step (missing = empty AND questionnaire-required). */
    const missingRequired = (keys: string[]): string | null => {
      for (const key of keys) {
        if (req(key) && !formData[key as keyof typeof formData]) return label(key).en;
      }
      return null;
    };
    switch (step) {
      case 1: {
        const missing = missingRequired(['organizationName', 'subCity', 'area', 'specificAddress']);
        if (missing) {
          toast({ title: 'Field Missing / Qabiyyee Hin Jiru', description: `Required: ${missing} / Barbaachisaadha`, variant: 'destructive' });
          return false;
        }
        return checkCustom(1);
      }
      case 2: {
        const missing = missingRequired(['numberOfRooms', 'licenseType', 'licenseLevel', 'licenseNumber']);
        if (missing) {
          toast({ title: 'Field Missing / Qabiyyee Hin Jiru', description: `Required: ${missing} / Barbaachisaadha`, variant: 'destructive' });
          return false;
        }
        return checkCustom(2);
      }
      case 3: {
        const missing = missingRequired(['ownerName', 'contactName', 'contactPhone']);
        if (missing) {
          toast({ title: 'Field Missing / Qabiyyee Hin Jiru', description: `Required: ${missing} / Barbaachisaadha`, variant: 'destructive' });
          return false;
        }
        const phoneClean = formData.contactPhone.replace(/[\s-]/g, '');
        const ethPhoneRegex = /^(\+251|251|0)?(9|7)\d{8}$/;
        if (!ethPhoneRegex.test(phoneClean)) {
          toast({ title: 'Invalid Phone / Bilbila Dogoggora', description: 'Enter valid Ethiopian number (e.g., +251 91 234 5678)', variant: 'destructive' });
          return false;
        }
        if (shown('contactPhone2') && formData.contactPhone2) {
          const phoneClean2 = formData.contactPhone2.replace(/[\s-]/g, '');
          if (!ethPhoneRegex.test(phoneClean2)) {
            toast({ title: 'Invalid Phone 2 / Bilbila 2 Dogoggora', description: 'Enter valid Ethiopian number for second contact', variant: 'destructive' });
            return false;
          }
        }
        if (shown('contactPhone2') && shown('contactName2') && formData.contactPhone2 && !formData.contactName2) {
          toast({ title: 'Name Required / Maqaa Barbaachisaa', description: 'Second contact person name is required when phone is provided / Bilbila 2 qofatu yoo galmeessame maqaan isaa barbaachisaa', variant: 'destructive' });
          return false;
        }
        return checkCustom(3);
      }
      case 4:
        if (dataConfirmed !== 'yes') {
          toast({ title: 'Confirmation Required / Mirkanaa\'uu Barbaachisaa', description: 'Please confirm data is true and authenticated / Daataan dhugaa fi mirkanaa\'eef mirkanaadhu', variant: 'destructive' });
          return false;
        }
        if (signaturePadRef.current?.isEmpty()) {
          toast({ title: 'Signature Required / Mallattoo Barbaachisaa', description: 'Please provide your signature / Mallattoo keessan galmeessaa', variant: 'destructive' });
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
    setCustomAnswers({});
    setCurrentStep(1);
    signaturePadRef.current?.clear();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(currentStep)) return;
    const signatureData = signaturePadRef.current?.getSignature() || null;
    const payload = { ...formData, serviceRating: 0, surveyorName, surveyorId, signature: signatureData, customAnswers: sanitizeCustomAnswers(fields, customAnswers) };
    setIsSubmitting(true);
    if (isOnline) {
      try {
        const response = await fetch('/api/guesthouses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          if (response.status >= 400 && response.status < 500) {
            // Server permanently rejected the record (validation) — queueing it offline would never succeed.
            toast({ title: 'Submission Rejected / Galmeen Morkame', description: err.error || 'Please correct the highlighted fields and submit again', variant: 'destructive' });
            return;
          }
          throw new Error(err.error || 'Server unavailable');
        }
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

  const reviewItems = (
    [
      shown('organizationName') && { label: 'Organization / Dhaabbataa', value: formData.organizationName },
      shown('subCity') && { label: 'Sub-City / Kuttaa Maggalaa', value: formData.subCity },
      shown('area') && { label: 'Werreda', value: formData.area },
      shown('specificAddress') && { label: 'Address / Baka Addaa', value: formData.specificAddress },
      shown('numberOfRooms') && { label: 'Rooms / Qubeettii', value: formData.numberOfRooms },
      shown('licenseType') && { label: label('licenseType').en, value: formData.licenseType },
      shown('licenseLevel') && { label: label('licenseLevel').en, value: formData.licenseLevel },
      shown('licenseNumber') && { label: label('licenseNumber').en, value: formData.licenseNumber },
      shown('ownerName') && { label: label('ownerName').en, value: formData.ownerName },
      shown('contactName') && { label: 'Contact 1 / Quunnamtaa 1', value: `${formData.contactName} — ${formData.contactPhone}` },
      (shown('contactName2') || shown('contactPhone2')) && { label: 'Contact 2 / Quunnamtaa 2', value: formData.contactName2 ? `${formData.contactName2} — ${formData.contactPhone2}` : formData.contactPhone2 },
      ...customReviewRows(fields, customAnswers),
    ].filter(Boolean) as { label: string; value: string }[]
  );

  return (
    <div className="mx-auto max-w-2xl">
      {/* Wizard progress — icon pills, gradient track, bilingual captions */}
      <SurveyProgress
        steps={STEPS}
        current={currentStep}
        onStepClick={(id) => { if (id < currentStep) setCurrentStep(id); }}
        actions={
          <button
            type="button"
            onClick={resetForm}
            className="flex items-center gap-1 text-[11px] font-medium text-rose-500 transition-colors hover:text-rose-700 sm:text-xs"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="hidden sm:inline">Reset / Balleessuu</span>
            <span className="sm:hidden">Reset</span>
          </button>
        }
      />

      <form onSubmit={handleSubmit}>
        <Card className="min-h-[300px] gap-4 sm:min-h-[360px]">
          {/* Step 1: Establishment */}
          {currentStep === 1 && (
            <>
              <SurveySectionHeader
                icon={Building2}
                title="Odeeffannoo Hundeeffama"
                subtitle="Establishment information"
                description="Basic details about the establishment"
                tone="emerald"
              />
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <SurveyFieldLabel id="organizationName" en={label('organizationName').en} or={label('organizationName').or} required={req('organizationName')} />
                  <Input id="organizationName" name="organizationName" placeholder="e.g., GOLD MARK HOTEL" value={formData.organizationName} onChange={handleChange} required className={surveyInputClass} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <SurveyFieldLabel id="subCity" en={label('subCity').en} or={label('subCity').or} required={req('subCity')} />
                    <Select value={formData.subCity} onValueChange={handleSubCityChange}>
                      <SelectTrigger id="subCity" className={surveySelectClass}><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
                      <SelectContent>{subCities.map((sc) => (<SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <SurveyFieldLabel id="area" en={label('area').en} or={label('area').or} required={req('area')} />
                    <Select value={formData.area} onValueChange={(v) => handleSelectChange('area', v)} disabled={!selectedSubCity}>
                      <SelectTrigger id="area" className={surveySelectClass}><SelectValue placeholder={selectedSubCity ? 'Select / Filadhu' : 'Select sub-city first'} /></SelectTrigger>
                      <SelectContent>{areas.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                {shown('specificAddress') && (
                <div className="space-y-1.5">
                  <SurveyFieldLabel id="specificAddress" en={label('specificAddress').en} or={label('specificAddress').or} required={req('specificAddress')} />
                  <Input id="specificAddress" name="specificAddress" placeholder="Street name, landmark..." value={formData.specificAddress} onChange={handleChange} className={surveyInputClass} />
                </div>
                )}
                {customQuestionsForStep(fields, 1).map((f) => (
                  <CustomQuestionField key={f.key} field={f} value={customAnswers[f.key] ?? ''} onChange={(v) => setCustom(f.key, v)} idPrefix="gh-custom" />
                ))}
              </CardContent>
            </>
          )}

          {/* Step 2: License */}
          {currentStep === 2 && (
            <>
              <SurveySectionHeader
                icon={FileText}
                title="Dandeettii fi Hayyama"
                subtitle="Capacity and license"
                description="Room capacity and licensing information"
                tone="blue"
              />
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <SurveyFieldLabel id="numberOfRooms" en={label('numberOfRooms').en} or={label('numberOfRooms').or} required={req('numberOfRooms')} />
                  <Input id="numberOfRooms" name="numberOfRooms" type="number" min="1" placeholder="e.g., 20" value={formData.numberOfRooms} onChange={handleChange} required className={surveyInputClass} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {shown('licenseType') && (
                  <div className="space-y-1.5">
                    <SurveyFieldLabel id="licenseType" en={label('licenseType').en} or={label('licenseType').or} required={req('licenseType')} />
                    <Select value={formData.licenseType} onValueChange={(v) => handleSelectChange('licenseType', v)}>
                      <SelectTrigger id="licenseType" className={surveySelectClass}><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
                      <SelectContent>{LICENSE_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  )}
                  {shown('licenseLevel') && (
                  <div className="space-y-1.5">
                    <SurveyFieldLabel id="licenseLevel" en={label('licenseLevel').en} or={label('licenseLevel').or} required={req('licenseLevel')} />
                    <Select value={formData.licenseLevel} onValueChange={(v) => handleSelectChange('licenseLevel', v)}>
                      <SelectTrigger id="licenseLevel" className={surveySelectClass}><SelectValue placeholder="Select / Filadhu" /></SelectTrigger>
                      <SelectContent>{LICENSE_LEVELS.map((l) => (<SelectItem key={l} value={l}>{l}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  )}
                </div>
                {shown('licenseNumber') && (
                <div className="space-y-1.5">
                  <SurveyFieldLabel id="licenseNumber" en={label('licenseNumber').en} or={label('licenseNumber').or} required={req('licenseNumber')} />
                  <Input id="licenseNumber" name="licenseNumber" placeholder="e.g., GH-2024-001" value={formData.licenseNumber} onChange={handleChange} className={surveyInputClass} />
                </div>
                )}
                {customQuestionsForStep(fields, 2).map((f) => (
                  <CustomQuestionField key={f.key} field={f} value={customAnswers[f.key] ?? ''} onChange={(v) => setCustom(f.key, v)} idPrefix="gh-custom" />
                ))}
              </CardContent>
            </>
          )}

          {/* Step 3: Contact */}
          {currentStep === 3 && (
            <>
              <SurveySectionHeader
                icon={Phone}
                title="Contact Information"
                subtitle="Odeeffannoo Quunnamtii"
                description="Owner and contact details"
                tone="purple"
              />
              <CardContent className="space-y-4">
                {shown('ownerName') && (
                <div className="space-y-1.5">
                  <SurveyFieldLabel id="ownerName" en={label('ownerName').en} or={label('ownerName').or} required={req('ownerName')} />
                  <Input id="ownerName" name="ownerName" placeholder="Full name of owner" value={formData.ownerName} onChange={handleChange} className={surveyInputClass} />
                </div>
                )}
                <div className="relative overflow-hidden rounded-xl border border-violet-200/70 bg-violet-50/40 p-3.5 space-y-3.5">
                  <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-violet-400 to-violet-500" />
                  <p className="flex items-center gap-1.5 pl-2 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                    <PhoneIncoming className="h-3 w-3" />
                    Quunnamtaa 1 / Contact 1
                  </p>
                  <div className="space-y-1.5 pl-2">
                    <SurveyFieldLabel id="contactName" en={label('contactName').en} or={label('contactName').or} required={req('contactName')} />
                    <Input id="contactName" name="contactName" placeholder="Manager or reception contact" value={formData.contactName} onChange={handleChange} required className={surveyInputClass} />
                  </div>
                  <div className="space-y-1.5 pl-2">
                    <SurveyFieldLabel id="contactPhone" en={label('contactPhone').en} or={label('contactPhone').or} required={req('contactPhone')} />
                    <Input id="contactPhone" name="contactPhone" type="tel" placeholder="e.g., +251 91 234 5678" value={formData.contactPhone} onChange={(e) => { const val = e.target.value.replace(/[^0-9+\s-]/g, ''); setFormData(prev => ({ ...prev, contactPhone: val })); }} required className={surveyInputClass} />
                  </div>
                </div>
                {(shown('contactName2') || shown('contactPhone2')) && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-3.5 space-y-3.5">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Quunnamtaa 2 / Contact 2
                    <span className="rounded-full bg-slate-200/70 px-1.5 py-px text-[9px] font-semibold normal-case tracking-normal text-slate-500">optional</span>
                  </p>
                  {shown('contactName2') && (
                  <div className="space-y-1.5">
                    <SurveyFieldLabel id="contactName2" en={label('contactName2').en} or={label('contactName2').or} required={req('contactName2')} />
                    <Input id="contactName2" name="contactName2" placeholder="Second contact person" value={formData.contactName2} onChange={handleChange} className={surveyInputClass} />
                  </div>
                  )}
                  {shown('contactPhone2') && (
                  <div className="space-y-1.5">
                    <SurveyFieldLabel id="contactPhone2" en={label('contactPhone2').en} or={label('contactPhone2').or} required={req('contactPhone2')} />
                    <Input id="contactPhone2" name="contactPhone2" type="tel" placeholder="e.g., +251 92 345 6789" value={formData.contactPhone2} onChange={(e) => { const val = e.target.value.replace(/[^0-9+\s-]/g, ''); setFormData(prev => ({ ...prev, contactPhone2: val })); }} className={surveyInputClass} />
                  </div>
                  )}
                </div>
                )}
                {customQuestionsForStep(fields, 3).map((f) => (
                  <CustomQuestionField key={f.key} field={f} value={customAnswers[f.key] ?? ''} onChange={(v) => setCustom(f.key, v)} idPrefix="gh-custom" />
                ))}
              </CardContent>
            </>
          )}

          {/* Step 4: Review & Confirm */}
          {currentStep === 4 && (
            <>
              <SurveySectionHeader
                icon={Eye}
                title="Review and confirm"
                subtitle="Odeeffannoo Quunnamtii"
                description="Review all data before submitting / Galii hunda ilaalii booda erguu"
                tone="slate"
              />
              <CardContent className="space-y-4">
                <SurveyReviewTable items={reviewItems} />
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-900/[0.08] bg-gradient-to-r from-emerald-50/70 to-teal-50/50 p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-600 ring-1 ring-emerald-600/15">
                    <UserCircle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700/70">Surveyor / Sakatta'aa</p>
                    <p className="truncate text-sm font-semibold text-slate-800">{surveyorName || 'Not logged in'}</p>
                  </div>
                </div>
                <RadioGroup value={dataConfirmed} onValueChange={setDataConfirmed}>
                  <div className="flex items-start space-x-3 rounded-xl border-2 border-emerald-300 bg-emerald-50/70 p-3.5 transition-all has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-100/80 has-[:checked]:shadow-md sm:p-4">
                    <RadioGroupItem value="yes" id="confirm-yes" className="mt-0.5" />
                    <Label htmlFor="confirm-yes" className="cursor-pointer leading-relaxed">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 sm:text-sm">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        I confirm that the data provided is true and authenticated
                      </span>
                      <br />
                      <span className="text-[11px] font-semibold text-emerald-700 sm:text-xs">Daataan keneenaa dhugaa fi mirkanaa'ee ta'uu isaa mirkaneffadhaa</span>
                    </Label>
                  </div>
                </RadioGroup>
                <div className="mt-3">
                  <SignaturePad
                    ref={signaturePadRef}
                    label="Signature / Mallattoo"
                    labelOr="Mallattoo Galmeessitichaa"
                  />
                </div>
              </CardContent>
            </>
          )}
        </Card>

        {/* Navigation — quiet Back, gradient Next / Submit */}
        <SurveyNav
          current={currentStep}
          total={STEPS.length}
          onBack={prevStep}
          onNext={nextStep}
          submitting={isSubmitting}
        />
      </form>
    </div>
  );
}
