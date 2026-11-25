/**
 * Generic registry of the admin-managed survey questionnaires — one per data
 * collection module (Hotel & Guest House, Health, Education, Agriculture,
 * Small Enterprise). The Industry module keeps its own registry
 * (industry-survey-fields.ts) with identical semantics.
 *
 * Admins manage each questionnaire from the module's "Manage" workspace (and
 * Administration → Settings → Survey): hide/disable optional questions, flip
 * required flags, edit the bilingual labels and reorder questions inside
 * their step. The wizard form, its step validation, the review list and the
 * server-side POST validation all follow this config. Core identification
 * fields (name, type, location, headline count, contact) are locked — records
 * would lose their backbone without them. Male/female breakdowns count as ONE
 * question ("…Sex" pseudo-keys), like the Industry "employeeSex" precedent.
 *
 * Storage: AppSetting "<sectorId>SurveyFields" — an ordered array of
 * { key, labelEn, labelOr, enabled, required }. Order within a wizard step
 * follows the saved array order; locked fields keep their registry position.
 * Hidden questions store empty/default values for new records.
 */

export type SurveyInput =
  | 'text'
  | 'number'
  | 'select'
  | 'select-multi'
  | 'radio-yesno'
  | 'sex-pair'
  | 'status-select';

export interface SurveyFieldDef {
  /** Payload field name (matches the model column / form field). */
  key: string;
  /** Wizard step the question sits on (forms use 1..3 + a fixed review step). */
  step: 1 | 2 | 3;
  /** Default English label. */
  labelEn: string;
  /** Default Afaan Oromoo sub-label. */
  labelOr: string;
  /** How the form renders the question. */
  input: SurveyInput;
  /** Whether it is required by default. */
  required: boolean;
  /** Cannot be disabled (core identification fields). */
  locked: boolean;
  /** Required flag is fixed (cannot be toggled in Settings). */
  requiredFixed: boolean;
}

export interface SurveyFieldConfig {
  key: string;
  labelEn: string;
  labelOr: string;
  enabled: boolean;
  required: boolean;
}

/** The modules whose questionnaires are managed outside the Industry registry. */
export type SurveySectorId =
  | 'guesthouse'
  | 'health'
  | 'education'
  | 'agriculture'
  | 'small-enterprise';

export interface SurveySectorDef {
  id: SurveySectorId;
  /** Display name used in the editor heading. */
  label: string;
  /** AppSetting key that stores the questionnaire. */
  settingKey: string;
  /** Wizard step titles shown by the editor, per question step. */
  stepTitles: Record<number, string>;
  /** Ordered question registry. */
  fields: SurveyFieldDef[];
}

// ============ Hotel & Guest House (GuestHouse model) ============

const GUESTHOUSE_FIELDS: SurveyFieldDef[] = [
  // ---- Step 1: Establishment ----
  {
    key: 'organizationName',
    step: 1,
    labelEn: 'Organization Name',
    labelOr: 'Maqaa Dhaabbataa',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'subCity',
    step: 1,
    labelEn: 'Sub-City',
    labelOr: 'Kuttaa Maggalaa',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'area',
    step: 1,
    labelEn: 'Woreda',
    labelOr: 'Werreda',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'specificAddress',
    step: 1,
    labelEn: 'Specific Address',
    labelOr: 'Baka Addaa',
    input: 'text',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  // ---- Step 2: Capacity & License ----
  {
    key: 'numberOfRooms',
    step: 2,
    labelEn: 'Number of Rooms',
    labelOr: 'Lakkoofsa Qubeettii',
    input: 'number',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'licenseType',
    step: 2,
    labelEn: 'License Type',
    labelOr: 'Goossa Eyyema',
    input: 'select',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'licenseLevel',
    step: 2,
    labelEn: 'License Level',
    labelOr: 'Saddarkaa Eyyema',
    input: 'select',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'licenseNumber',
    step: 2,
    labelEn: 'License Number',
    labelOr: 'Lakofsaa Eyyema',
    input: 'text',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  // ---- Step 3: Contact ----
  {
    key: 'ownerName',
    step: 3,
    labelEn: 'Owner Name',
    labelOr: 'Maqaa Abbaa Qaabeyee',
    input: 'text',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'contactName',
    step: 3,
    labelEn: 'Contact Person',
    labelOr: 'Nama Adadura Qunnamnu',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'contactPhone',
    step: 3,
    labelEn: 'Phone Number',
    labelOr: 'Lakkoofsa Bilbila',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'contactPhone2',
    step: 3,
    labelEn: 'Phone Number 2',
    labelOr: 'Lakkoofsa Bilbila 2',
    input: 'text',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'contactName2',
    step: 3,
    labelEn: 'Contact Person 2',
    labelOr: 'Nama Adadura Qunnamnu 2',
    input: 'text',
    required: false,
    locked: false,
    requiredFixed: false,
  },
];

// ============ Health facility (HealthCenter model) ============

/** "Staff by Sex" counts male + female as one question. */
export const HEALTH_SEX_PAIR_KEY = 'staffSex';

const HEALTH_FIELDS: SurveyFieldDef[] = [
  // ---- Step 1: Facility ----
  {
    key: 'facilityName',
    step: 1,
    labelEn: 'Facility Name',
    labelOr: 'Maqaa Manaa Yaalaa',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'facilityType',
    step: 1,
    labelEn: 'Facility Type',
    labelOr: 'Gosa Manaa Yaalaa',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'subCity',
    step: 1,
    labelEn: 'Sub-City',
    labelOr: 'Kuttaa Maggalaa',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'area',
    step: 1,
    labelEn: 'Woreda',
    labelOr: 'Werreda',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'specificAddress',
    step: 1,
    labelEn: 'Specific Address',
    labelOr: 'Baka Addaa',
    input: 'text',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  // ---- Step 2: Capacity & services ----
  {
    key: 'licenseNumber',
    step: 2,
    labelEn: 'License Number',
    labelOr: 'Lakofsaa Eyyeema',
    input: 'text',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'ownershipType',
    step: 2,
    labelEn: 'Ownership Type',
    labelOr: 'Gosa Abbaa Qabuu',
    input: 'select',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'staffCount',
    step: 2,
    labelEn: 'Staff Count',
    labelOr: 'Lakkoofsa Hojjetaa',
    input: 'number',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: HEALTH_SEX_PAIR_KEY,
    step: 2,
    labelEn: 'Staff by Sex',
    labelOr: 'Hojjetaa Dhiira fi Dubartii',
    input: 'sex-pair',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'bedCount',
    step: 2,
    labelEn: 'Inpatient Beds',
    labelOr: 'Lakkoofsa Siree',
    input: 'number',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'hasLaboratory',
    step: 2,
    labelEn: 'Laboratory service',
    labelOr: 'Laboratoire',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true, // yes/no always has an answer — required is meaningless
  },
  {
    key: 'hasPharmacy',
    step: 2,
    labelEn: 'Pharmacy service',
    labelOr: 'Faayinmaa',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  {
    key: 'hasMaternity',
    step: 2,
    labelEn: 'Maternity / delivery service',
    labelOr: 'Dhalachaa',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  {
    key: 'hasEmergency',
    step: 2,
    labelEn: 'Emergency service (24/7)',
    labelOr: 'Ethiirtii 24/7',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  // ---- Step 3: Contact ----
  {
    key: 'contactName',
    step: 3,
    labelEn: 'Contact Person',
    labelOr: 'Nama Quunnamtu',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'contactPhone',
    step: 3,
    labelEn: 'Contact Phone',
    labelOr: 'Bilbila Quunnamtii',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
];

// ============ Education institution (EducationCenter model) ============

/** "Students by Sex" / "Teachers by Sex" count as one question each. */
export const EDUCATION_STUDENT_SEX_KEY = 'studentsSex';
export const EDUCATION_TEACHER_SEX_KEY = 'teachersSex';

const EDUCATION_FIELDS: SurveyFieldDef[] = [
  // ---- Step 1: Institution ----
  {
    key: 'institutionName',
    step: 1,
    labelEn: 'Institution Name',
    labelOr: 'Maqaa Mana Barumsaa',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'institutionTypes',
    step: 1,
    labelEn: 'Institution Type',
    labelOr: 'Gosa Mana Barumsaa',
    input: 'select-multi',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'subCity',
    step: 1,
    labelEn: 'Sub-City',
    labelOr: 'Kuttaa Maggalaa',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'area',
    step: 1,
    labelEn: 'Woreda',
    labelOr: 'Werreda',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'specificAddress',
    step: 1,
    labelEn: 'Specific Address',
    labelOr: 'Baka Addaa',
    input: 'text',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  // ---- Step 2: Capacity & services ----
  {
    key: 'licenseNumber',
    step: 2,
    labelEn: 'License Number',
    labelOr: 'Lakofsaa Eyyeema',
    input: 'text',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'ownershipType',
    step: 2,
    labelEn: 'Ownership Type',
    labelOr: 'Gosa Abbaa Qabuu',
    input: 'select',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'studentCount',
    step: 2,
    labelEn: 'Student Count',
    labelOr: 'Lakkoofsa Barataa',
    input: 'number',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: EDUCATION_STUDENT_SEX_KEY,
    step: 2,
    labelEn: 'Students by Sex',
    labelOr: 'Barattoota Dhiira fi Dubartii',
    input: 'sex-pair',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'teacherCount',
    step: 2,
    labelEn: 'Teacher Count',
    labelOr: 'Lakkoofsa Barsiisaa',
    input: 'number',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  {
    key: EDUCATION_TEACHER_SEX_KEY,
    step: 2,
    labelEn: 'Teachers by Sex',
    labelOr: 'Barsiisota Dhiira fi Dubartii',
    input: 'sex-pair',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'classroomCount',
    step: 2,
    labelEn: 'Classroom Count',
    labelOr: 'Lakkoofsa Kutaa Barumsaa',
    input: 'number',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'hasLibrary',
    step: 2,
    labelEn: 'Library service',
    labelOr: 'Mana Maxxantaa',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  {
    key: 'hasLaboratory',
    step: 2,
    labelEn: 'Laboratory service',
    labelOr: 'Laboratoire',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  {
    key: 'hasComputerLab',
    step: 2,
    labelEn: 'Computer lab',
    labelOr: 'Kompiyuutaraa',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  {
    key: 'hasFeedingProgram',
    step: 2,
    labelEn: 'School feeding program',
    labelOr: 'Soorataa',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  // ---- Step 3: Contact ----
  {
    key: 'contactName',
    step: 3,
    labelEn: 'Contact Person',
    labelOr: 'Nama Quunnamtu',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'contactPhone',
    step: 3,
    labelEn: 'Contact Phone',
    labelOr: 'Bilbila Quunnamtii',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
];

// ============ Agriculture (AgricultureCenter model) ============

/** "Workers by Sex" counts male + female as one question. */
export const AGRICULTURE_SEX_PAIR_KEY = 'workersSex';

const AGRICULTURE_FIELDS: SurveyFieldDef[] = [
  // ---- Step 1: Farm ----
  {
    key: 'farmName',
    step: 1,
    labelEn: 'Farm / Establishment Name',
    labelOr: 'Maqaa Mana Qonnaa',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'farmType',
    step: 1,
    labelEn: 'Farm Type',
    labelOr: 'Gosa Qonnaa',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'subCity',
    step: 1,
    labelEn: 'Sub-City',
    labelOr: 'Kuttaa Maggalaa',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'area',
    step: 1,
    labelEn: 'Woreda',
    labelOr: 'Werreda',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'specificAddress',
    step: 1,
    labelEn: 'Specific Address',
    labelOr: 'Baka Addaa',
    input: 'text',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  // ---- Step 2: Land & capacity ----
  {
    key: 'licenseNumber',
    step: 2,
    labelEn: 'License Number',
    labelOr: 'Lakofsaa Eyyeema',
    input: 'text',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'ownershipType',
    step: 2,
    labelEn: 'Ownership Type',
    labelOr: 'Gosa Abbaa Qabuu',
    input: 'select',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'landSizeHectares',
    step: 2,
    labelEn: 'Land Size (ha)',
    labelOr: 'Dachaa',
    input: 'number',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'workerCount',
    step: 2,
    labelEn: 'Worker Count',
    labelOr: 'Lakkoofsa Hojjetaa',
    input: 'number',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: AGRICULTURE_SEX_PAIR_KEY,
    step: 2,
    labelEn: 'Workers by Sex',
    labelOr: 'Hojjettoota Dhiira fi Dubartii',
    input: 'sex-pair',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'hasIrrigation',
    step: 2,
    labelEn: 'Irrigation',
    labelOr: '',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  {
    key: 'hasGreenhouse',
    step: 2,
    labelEn: 'Greenhouse',
    labelOr: '',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  {
    key: 'hasMachinery',
    step: 2,
    labelEn: 'Farm machinery',
    labelOr: 'Meeshaa Qonnaa',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  {
    key: 'hasStorage',
    step: 2,
    labelEn: 'Storage',
    labelOr: '',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  // ---- Step 3: Contact ----
  {
    key: 'contactName',
    step: 3,
    labelEn: 'Contact Person',
    labelOr: 'Nama Quunnamtu',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'contactPhone',
    step: 3,
    labelEn: 'Contact Phone',
    labelOr: 'Bilbila Quunnamtii',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
];

// ============ Small Enterprise (SmallEnterprise model) ============

/** "Employees by Sex" counts male + female as one question. */
export const SME_SEX_PAIR_KEY = 'employeesSex';

const SME_FIELDS: SurveyFieldDef[] = [
  // ---- Step 1: Enterprise ----
  {
    key: 'enterpriseName',
    step: 1,
    labelEn: 'Enterprise Name',
    labelOr: '',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'enterpriseType',
    step: 1,
    labelEn: 'Enterprise Type',
    labelOr: 'Gosa Midhaalee',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'subCity',
    step: 1,
    labelEn: 'Sub-City',
    labelOr: 'Kuttaa Maggalaa',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'area',
    step: 1,
    labelEn: 'Woreda',
    labelOr: 'Werreda',
    input: 'select',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'specificAddress',
    step: 1,
    labelEn: 'Specific Address',
    labelOr: 'Baka Addaa',
    input: 'text',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'status',
    step: 1,
    labelEn: 'Current Status',
    labelOr: 'Sadarkaa Ammaa',
    input: 'status-select',
    required: false,
    locked: false,
    requiredFixed: true, // always has a value — defaults to REGISTERED
  },
  // ---- Step 2: Capacity & support ----
  {
    key: 'licenseNumber',
    step: 2,
    labelEn: 'License Number',
    labelOr: 'Lakofsaa Eyyeema',
    input: 'text',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'ownershipType',
    step: 2,
    labelEn: 'Ownership Type',
    labelOr: 'Gosa Abbaa Qabuu',
    input: 'select',
    required: true,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'employeeCount',
    step: 2,
    labelEn: 'Employee Count',
    labelOr: 'Lakkoofsa Hojjetaa',
    input: 'number',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: SME_SEX_PAIR_KEY,
    step: 2,
    labelEn: 'Employees by Sex',
    labelOr: 'Hojjetaa Dhiira fi Dubartii',
    input: 'sex-pair',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'startupCapital',
    step: 2,
    labelEn: 'Startup Capital (ETB)',
    labelOr: 'Maallaqa Jalqabaa',
    input: 'number',
    required: false,
    locked: false,
    requiredFixed: false,
  },
  {
    key: 'hasPremises',
    step: 2,
    labelEn: 'Own Working Premises',
    labelOr: 'Iddoo hojii mataa isaa',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  {
    key: 'hasTraining',
    step: 2,
    labelEn: 'MSE Training / Support',
    labelOr: 'Deeggarsa fi leenjii',
    input: 'radio-yesno',
    required: false,
    locked: false,
    requiredFixed: true,
  },
  // ---- Step 3: Contact ----
  {
    key: 'contactName',
    step: 3,
    labelEn: 'Contact Person',
    labelOr: 'Nama Quunnamtu',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
  {
    key: 'contactPhone',
    step: 3,
    labelEn: 'Contact Phone',
    labelOr: 'Bilbila Quunnamtii',
    input: 'text',
    required: true,
    locked: true,
    requiredFixed: true,
  },
];

// ============ Sector registry map ============

export const SURVEY_SECTORS: Record<SurveySectorId, SurveySectorDef> = {
  guesthouse: {
    id: 'guesthouse',
    label: 'Hotel & Guest House',
    settingKey: 'guesthouseSurveyFields',
    stepTitles: {
      1: 'Step 1 — Establishment / Hundeeffama',
      2: 'Step 2 — Capacity & License / Dandeettii fi Laisansii',
      3: 'Step 3 — Contact / Quunnamtii',
    },
    fields: GUESTHOUSE_FIELDS,
  },
  health: {
    id: 'health',
    label: 'Health Facility',
    settingKey: 'healthSurveyFields',
    stepTitles: {
      1: 'Step 1 — Facility / Manaa Yaalaa',
      2: 'Step 2 — Capacity & Services / Dandeettii fi Tajaajila',
      3: 'Step 3 — Contact / Quunnamtii',
    },
    fields: HEALTH_FIELDS,
  },
  education: {
    id: 'education',
    label: 'Education Institution',
    settingKey: 'educationSurveyFields',
    stepTitles: {
      1: 'Step 1 — Institution / Mana Barumsaa',
      2: 'Step 2 — Capacity & Services / Dandeettii fi Tajaajila',
      3: 'Step 3 — Contact / Quunnamtii',
    },
    fields: EDUCATION_FIELDS,
  },
  agriculture: {
    id: 'agriculture',
    label: 'Agriculture',
    settingKey: 'agricultureSurveyFields',
    stepTitles: {
      1: 'Step 1 — Farm / Mana Qonnaa',
      2: 'Step 2 — Land & Capacity / Dachaa fi Dandeettii',
      3: 'Step 3 — Contact / Quunnamtii',
    },
    fields: AGRICULTURE_FIELDS,
  },
  'small-enterprise': {
    id: 'small-enterprise',
    label: 'Small Enterprise',
    settingKey: 'smallEnterpriseSurveyFields',
    stepTitles: {
      1: 'Step 1 — Enterprise / Midhaalee',
      2: 'Step 2 — Capacity & Support / Dandeettii fi Deeggarsa',
      3: 'Step 3 — Contact / Quunnamtii',
    },
    fields: SME_FIELDS,
  },
};

export const SURVEY_SECTOR_IDS = Object.keys(SURVEY_SECTORS) as SurveySectorId[];

export function isSurveySectorId(value: unknown): value is SurveySectorId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SURVEY_SECTORS, value);
}

// ============ Per-sector helpers (mirror industry-survey-fields.ts) ============

export function sectorSurveyFieldDef(sector: SurveySectorId, key: string): SurveyFieldDef | undefined {
  return SURVEY_SECTORS[sector].fields.find((f) => f.key === key);
}

export function isSectorSurveyFieldKey(sector: SurveySectorId, key: unknown): key is string {
  return typeof key === 'string' && SURVEY_SECTORS[sector].fields.some((f) => f.key === key);
}

/** Default config for a sector: every registry question enabled with default labels. */
export function sectorSurveyFieldsDefault(sector: SurveySectorId): SurveyFieldConfig[] {
  return SURVEY_SECTORS[sector].fields.map((f) => ({
    key: f.key,
    labelEn: f.labelEn,
    labelOr: f.labelOr,
    enabled: true,
    required: f.required,
  }));
}

/**
 * Validates an admin-managed questionnaire for a sector. Keeps the saved order
 * for known keys (per step, since steps are fixed), drops unknown keys and
 * duplicates, forces locked fields enabled and fixed-required fields required,
 * trims labels (falls back to the registry default when empty). Returns null
 * when nothing valid remains (the caller rejects the save).
 */
export function normalizeSectorSurveyFields(
  sector: SurveySectorId,
  raw: unknown
): SurveyFieldConfig[] | null {
  if (!Array.isArray(raw)) return null;
  const registry = SURVEY_SECTORS[sector].fields;
  const seen = new Set<string>();
  const out: SurveyFieldConfig[] = [];
  for (const item of raw) {
    const key = (item as { key?: unknown })?.key;
    if (!isSectorSurveyFieldKey(sector, key) || seen.has(key)) continue;
    seen.add(key);
    const def = registry.find((f) => f.key === key)!;
    const labelEn =
      typeof (item as { labelEn?: unknown })?.labelEn === 'string' &&
      (item as { labelEn?: string }).labelEn!.trim()
        ? (item as { labelEn?: string }).labelEn!.trim().slice(0, 120)
        : def.labelEn;
    const labelOr =
      typeof (item as { labelOr?: unknown })?.labelOr === 'string' &&
      (item as { labelOr?: string }).labelOr!.trim()
        ? (item as { labelOr?: string }).labelOr!.trim().slice(0, 120)
        : def.labelOr;
    out.push({
      key,
      labelEn,
      labelOr,
      enabled: def.locked ? true : (item as { enabled?: unknown })?.enabled !== false,
      required: def.requiredFixed ? true : (item as { required?: unknown })?.required === true,
    });
  }
  // Every registry field must be present — append any the admin list missed so
  // a stale config can never drop a locked field.
  for (const def of registry) {
    if (!seen.has(def.key)) {
      out.push({
        key: def.key,
        labelEn: def.labelEn,
        labelOr: def.labelOr,
        enabled: true,
        required: def.required,
      });
    }
  }
  return out.length > 0 ? out : null;
}

/**
 * Merges a saved config with the registry — the read-side equivalent of
 * normalizeSectorSurveyFields for configs persisted earlier. Falls back to
 * the defaults when nothing valid was saved.
 */
export function mergeSectorSurveyFields(
  sector: SurveySectorId,
  saved: unknown
): SurveyFieldConfig[] {
  return normalizeSectorSurveyFields(sector, saved) ?? sectorSurveyFieldsDefault(sector);
}

/** Ordered fields of one wizard step (saved order within the step). */
export function sectorSurveyFieldsForStep(
  sector: SurveySectorId,
  fields: SurveyFieldConfig[],
  step: 1 | 2 | 3
): SurveyFieldConfig[] {
  return fields.filter((f) => sectorSurveyFieldDef(sector, f.key)?.step === step && f.enabled);
}

/** Whether a field is currently shown on the form. */
export function sectorSurveyFieldEnabled(
  sector: SurveySectorId,
  fields: SurveyFieldConfig[],
  key: string
): boolean {
  const cfg = fields.find((f) => f.key === key);
  if (!cfg) return sectorSurveyFieldDef(sector, key)?.locked ?? false;
  return cfg.enabled;
}

/** Whether a shown field must be filled before submission. */
export function sectorSurveyFieldRequired(
  sector: SurveySectorId,
  fields: SurveyFieldConfig[],
  key: string
): boolean {
  const cfg = fields.find((f) => f.key === key);
  const def = sectorSurveyFieldDef(sector, key);
  if (!cfg) return def?.required ?? false;
  return def?.requiredFixed ? true : cfg.required;
}
