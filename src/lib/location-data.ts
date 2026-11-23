export interface LocationData {
  subCities: {
    name: string;
    areas: string[];
  }[];
}

export const locationData: LocationData = {
  subCities: [
    {
      name: 'Dukam',
      areas: [
        'Odaa Nabee',
        'Xaddachaa',
        'Malkaa',
        'Abbuu Seeraa',
      ],
    },
    {
      name: 'Chelaleka',
      areas: [
        'Erere',
        'Arsadee',
        'Kilolee',
      ],
    },
    {
      name: 'Debaayyuu',
      areas: ['Dhakaa Boora', 'Dirree', 'Horaa', 'Biiftuu'],
    },
  ],
};

export function getAreasForSubCity(subCityName: string): string[] {
  const subCity = locationData.subCities.find(
    (sc) => sc.name === subCityName
  );
  return subCity ? subCity.areas : [];
}

export function getAllSubCities(): string[] {
  return locationData.subCities.map((sc) => sc.name);
}

export const LICENSE_TYPES = [
  'Hotel',
  'Guest House',
  'Lodge',
  'Hostel',
  'Motel',
  'Resort',
  'Bed & Breakfast',
];

export const LICENSE_LEVELS = [
  'Star 1',
  'Star 2',
  'Star 3',
  'Star 4',
  'Star 5',
  'Standard',
  'Not Rated',
  'Under License',
];

// Industry (Indastrii) data classification — Bishoftu industry survey
export const SECTORS = [
  'Food & Beverage Processing',
  'Agro-Processing',
  'Textile & Garment',
  'Leather & Leather Products',
  'Wood & Furniture',
  'Metal Works & Fabrication',
  'Construction Materials',
  'Chemicals & Plastics',
  'Bottling & Water',
  'Flour Mill & Grain Processing',
  'Garage & Auto Repair',
  'Mining & Quarrying',
  'Energy & Utilities',
  'Other Manufacturing',
];

export const OWNERSHIP_TYPES = [
  'Sole Proprietorship',
  'Private Limited Company',
  'Share Company',
  'Cooperative',
  'Government',
  'Other',
];

// Health facility (Manaa Yaalaa) data classification — Bishoftu health survey
export const HEALTH_FACILITY_TYPES = [
  'Hospital',
  'Health Center',
  'Private Clinic',
  'Health Post',
  'Pharmacy',
  'Diagnostic Laboratory',
  'Dental Clinic',
  'Specialized Center',
];

export const HEALTH_OWNERSHIP_TYPES = [
  'Government / Public',
  'Private',
  'NGO',
  'Faith-Based',
  'Public-Private Partnership',
];

// Educational institution (Mana Barumsaa) data classification — Bishoftu education survey
export const EDUCATION_INSTITUTION_TYPES = [
  'Kindergarten',
  'Primary School (1-4)',
  'Middle School (5-8)',
  'Secondary School (9-10)',
  'Preparatory School (11-12)',
  'TVET College',
  'Private College',
  'University',
  'Special Needs Center',
  'Adult Education Center',
];

export const EDUCATION_OWNERSHIP_TYPES = [
  'Government / Public',
  'Private',
  'Faith-Based',
  'NGO',
  'Community',
];

// An institution can serve more than one level (e.g. Kindergarten + Primary School),
// so institutionType is stored as a comma-separated list "Type A, Type B".
// None of the EDUCATION_INSTITUTION_TYPES values contain commas, so splitting on "," is safe.

/** Split a stored institutionType value ("A, B") into its individual types. */
export function splitInstitutionTypes(value: string | null | undefined): string[] {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normalize multi-select input (comma-separated string or array) into the canonical "A, B" storage format. */
export function normalizeInstitutionTypes(value: string | string[] | null | undefined): string {
  const list = Array.isArray(value) ? value : splitInstitutionTypes(value);
  const unique: string[] = [];
  for (const raw of list) {
    const t = raw.trim();
    if (t && !unique.includes(t)) unique.push(t);
  }
  return unique.join(', ');
}

// Agricultural establishment (Mana Qonnaa) data classification — Bishoftu agriculture survey
export const AGRICULTURE_FARM_TYPES = [
  'Crop Production',
  'Livestock Rearing',
  'Dairy Farming',
  'Poultry Farming',
  'Fishery / Aquaculture',
  'Apiculture (Honey)',
  'Horticulture & Floriculture',
  'Agro-Input Supplier',
  'Agricultural Cooperative',
  'Veterinary & AI Service',
];

export const AGRICULTURE_OWNERSHIP_TYPES = [
  'Private',
  'Cooperative',
  'Government / Public',
  'NGO',
  'Commercial (Foreign Investment)',
];
