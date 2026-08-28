import {
  Doctor,
  Specialty,
  asClinicId,
  asDoctorId,
  asSpecialtyId,
  type ClinicId,
} from '../../domain/index.js';

/** Stable demo clinic id — override with SEED_CLINIC_ID for multi-tenant experiments. */
export const DEMO_CLINIC_ID = asClinicId('a1000000-0000-4000-8000-000000000001');

export const DEMO_CLINIC_NAME = 'Cairo Medical Center';
export const DEMO_CLINIC_TIMEZONE = 'Africa/Cairo';

type SpecialtySeed = {
  id: string;
  name: string;
  description: string;
};

type DoctorSeed = {
  id: string;
  fullName: string;
  specialtyKeys: string[];
  bio: string;
  calendarResourceId: string;
  active?: boolean;
};

const SPECIALTY_SEEDS: SpecialtySeed[] = [
  {
    id: 'a2000000-0000-4000-8000-000000000001',
    name: 'Cardiology',
    description:
      'Heart and cardiovascular care — قلب، ضغط، أوردة، and preventive cardiac medicine.',
  },
  {
    id: 'a2000000-0000-4000-8000-000000000002',
    name: 'Dermatology',
    description: 'Skin, hair, and nail care — جلدية، حب الشباب، and cosmetic dermatology.',
  },
  {
    id: 'a2000000-0000-4000-8000-000000000003',
    name: 'Pediatrics',
    description: 'Children and adolescent health — أطفال، تطعيمات، and growth monitoring.',
  },
  {
    id: 'a2000000-0000-4000-8000-000000000004',
    name: 'Orthopedics',
    description: 'Bones, joints, and sports injuries — عظام، مفاصل، and physiotherapy referrals.',
  },
  {
    id: 'a2000000-0000-4000-8000-000000000005',
    name: 'ENT',
    description: 'Ear, nose, and throat — أنف وأذن وحنجرة، sinus, and hearing care.',
  },
  {
    id: 'a2000000-0000-4000-8000-000000000006',
    name: 'Ophthalmology',
    description: 'Eye care and vision — عيون، cataract screening, and glaucoma follow-up.',
  },
  {
    id: 'a2000000-0000-4000-8000-000000000007',
    name: 'Gynecology',
    description: "Women's health — نساء، توليد، and reproductive wellness.",
  },
  {
    id: 'a2000000-0000-4000-8000-000000000008',
    name: 'Neurology',
    description: 'Brain and nervous system — مخ وأعصاب، migraine, and epilepsy follow-up.',
  },
  {
    id: 'a2000000-0000-4000-8000-000000000009',
    name: 'Psychiatry',
    description: 'Mental health — نفسية، anxiety, depression, and counseling support.',
  },
  {
    id: 'a2000000-0000-4000-8000-000000000010',
    name: 'General Practice',
    description: 'Primary care and check-ups — كشف عام، family medicine, and referrals.',
  },
  {
    id: 'a2000000-0000-4000-8000-000000000011',
    name: 'Internal Medicine',
    description: 'Adult internal medicine — باطنة، diabetes, hypertension, and chronic care.',
  },
];

const DOCTOR_SEEDS: DoctorSeed[] = [
  {
    id: 'a3000000-0000-4000-8000-000000000001',
    fullName: 'Dr Sara Hassan',
    specialtyKeys: ['Cardiology'],
    bio: 'Senior cardiologist — heart disease, hypertension, and echocardiography. دكتورة قلب وضغط.',
    calendarResourceId: 'cal_sara_hassan',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000002',
    fullName: 'Dr Ahmed Fawzy',
    specialtyKeys: ['Cardiology'],
    bio: 'Interventional cardiologist — angioplasty and coronary care. دكتور قلب وقسطرة.',
    calendarResourceId: 'cal_ahmed_fawzy',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000003',
    fullName: 'Dr Nadia El-Masry',
    specialtyKeys: ['Cardiology'],
    bio: 'Cardiac imaging specialist — stress tests and preventive heart care. دكتورة قلب وصور.',
    calendarResourceId: 'cal_nadia_elmasry',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000004',
    fullName: 'Dr Karim Soliman',
    specialtyKeys: ['Cardiology'],
    bio: 'Electrophysiology — arrhythmia and pacemaker follow-up. دكتور قلب و نظم.',
    calendarResourceId: 'cal_karim_soliman',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000005',
    fullName: 'Dr Omar Nabil',
    specialtyKeys: ['Dermatology'],
    bio: 'Consultant dermatologist — acne, eczema, and laser treatments. دكتور جلدية.',
    calendarResourceId: 'cal_omar_nabil',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000006',
    fullName: 'Dr Layla Mahmoud',
    specialtyKeys: ['Dermatology'],
    bio: 'Pediatric dermatology and cosmetic skin care. دكتورة جلدية أطفال.',
    calendarResourceId: 'cal_layla_mahmoud',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000007',
    fullName: 'Dr Youssef Kamal',
    specialtyKeys: ['Dermatology'],
    bio: 'Skin allergy and psoriasis specialist. دكتور حساسية جلد.',
    calendarResourceId: 'cal_youssef_kamal',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000008',
    fullName: 'Dr Mona Salah',
    specialtyKeys: ['Pediatrics'],
    bio: 'General pediatrician — newborn care and vaccinations. دكتورة أطفال.',
    calendarResourceId: 'cal_mona_salah',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000009',
    fullName: 'Dr Hossam Farid',
    specialtyKeys: ['Pediatrics'],
    bio: 'Pediatric pulmonology — asthma and chest infections. دكتور أطفال صدر.',
    calendarResourceId: 'cal_hossam_farid',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000010',
    fullName: 'Dr Rania Adel',
    specialtyKeys: ['Pediatrics'],
    bio: 'Developmental pediatrics and nutrition counseling. دكتورة نمو أطفال.',
    calendarResourceId: 'cal_rania_adel',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000011',
    fullName: 'Dr Tarek Mansour',
    specialtyKeys: ['Orthopedics'],
    bio: 'Joint replacement and knee surgery. دكتور عظام ومفاصل.',
    calendarResourceId: 'cal_tarek_mansour',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000012',
    fullName: 'Dr Dina Hosny',
    specialtyKeys: ['Orthopedics'],
    bio: 'Sports medicine and fracture care. دكتورة رياضة وكسور.',
    calendarResourceId: 'cal_dina_hosny',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000013',
    fullName: 'Dr Amr El-Sayed',
    specialtyKeys: ['Orthopedics'],
    bio: 'Spine and back pain specialist. دكتور ظهر وعمود فقري.',
    calendarResourceId: 'cal_amr_elsayed',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000014',
    fullName: 'Dr Sherif Nader',
    specialtyKeys: ['ENT'],
    bio: 'Sinus, allergy, and hearing disorders. دكتور أنف وأذن.',
    calendarResourceId: 'cal_sherif_nader',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000015',
    fullName: 'Dr Heba Lotfy',
    specialtyKeys: ['ENT'],
    bio: 'Voice disorders and pediatric ENT. دكتورة حنجرة وأطفال.',
    calendarResourceId: 'cal_heba_lotfy',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000016',
    fullName: 'Dr Mahmoud Rizk',
    specialtyKeys: ['Ophthalmology'],
    bio: 'Cataract surgery and glaucoma management. دكتور عيون.',
    calendarResourceId: 'cal_mahmoud_rizk',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000017',
    fullName: 'Dr Salma Anwar',
    specialtyKeys: ['Ophthalmology'],
    bio: 'Retina specialist and diabetic eye screening. دكتورة شبكية.',
    calendarResourceId: 'cal_salma_anwar',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000018',
    fullName: 'Dr Aya Mostafa',
    specialtyKeys: ['Gynecology'],
    bio: 'Obstetrics and prenatal care. دكتورة نساء وتوليد.',
    calendarResourceId: 'cal_aya_mostafa',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000019',
    fullName: 'Dr Reem Khalil',
    specialtyKeys: ['Gynecology'],
    bio: 'Gynecologic oncology screening and women wellness. دكتورة أورام نساء.',
    calendarResourceId: 'cal_reem_khalil',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000020',
    fullName: 'Dr Nour Ibrahim',
    specialtyKeys: ['Gynecology'],
    bio: 'Infertility counseling and hormonal care. دكتورة خصوبة.',
    calendarResourceId: 'cal_nour_ibrahim',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000021',
    fullName: 'Dr Bassem Hamed',
    specialtyKeys: ['Neurology'],
    bio: 'Stroke care and migraine management. دكتور مخ وأعصاب.',
    calendarResourceId: 'cal_bassem_hamed',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000022',
    fullName: 'Dr Ghada Fouad',
    specialtyKeys: ['Neurology'],
    bio: 'Epilepsy and movement disorders. دكتورة صرع.',
    calendarResourceId: 'cal_ghada_fouad',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000023',
    fullName: 'Dr Khaled Samir',
    specialtyKeys: ['Psychiatry'],
    bio: 'Anxiety, depression, and medication management. دكتور نفسي.',
    calendarResourceId: 'cal_khaled_samir',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000024',
    fullName: 'Dr Mariam Zaki',
    specialtyKeys: ['Psychiatry'],
    bio: 'Child psychiatry and family counseling. دكتورة نفسية أطفال.',
    calendarResourceId: 'cal_mariam_zaki',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000025',
    fullName: 'Dr Ali Hassan',
    specialtyKeys: ['General Practice'],
    bio: 'Family doctor — check-ups, chronic follow-up, referrals. دكتور كشف عام.',
    calendarResourceId: 'cal_ali_hassan',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000026',
    fullName: 'Dr Fatma Nabil',
    specialtyKeys: ['General Practice'],
    bio: 'Primary care for adults and elderly patients. دكتورة طب أسرة.',
    calendarResourceId: 'cal_fatma_nabil',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000027',
    fullName: 'Dr Sami Youssef',
    specialtyKeys: ['General Practice'],
    bio: 'Travel medicine and occupational health. دكتور صحة مهنية.',
    calendarResourceId: 'cal_sami_youssef',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000028',
    fullName: 'Dr Engy Tamer',
    specialtyKeys: ['General Practice'],
    bio: 'Women and men wellness visits. دكتورة كشف دوري.',
    calendarResourceId: 'cal_engy_tamer',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000029',
    fullName: 'Dr Walid Gamal',
    specialtyKeys: ['Internal Medicine'],
    bio: 'Diabetes and endocrine disorders. دكتور باطنة وسكر.',
    calendarResourceId: 'cal_walid_gamal',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000030',
    fullName: 'Dr Hala Sherif',
    specialtyKeys: ['Internal Medicine'],
    bio: 'Hypertension and kidney disease follow-up. دكتورة باطنة وضغط.',
    calendarResourceId: 'cal_hala_sherif',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000031',
    fullName: 'Dr Osama Darwish',
    specialtyKeys: ['Internal Medicine'],
    bio: 'Gastroenterology-focused internist — liver and digestive care. دكتور باطنة ومعدة.',
    calendarResourceId: 'cal_osama_darwish',
  },
];

export type DemoClinicCatalog = {
  clinicId: ClinicId;
  specialties: Specialty[];
  doctors: Doctor[];
};

export type BuildDemoClinicCatalogOptions = {
  /**
   * Google Calendar id shared by demo doctors (GOOGLE_CALENDAR_ID).
   * When omitted, seed keeps cal_* placeholders; GoogleCalendarGateway maps those to defaultCalendarId.
   */
  calendarResourceId?: string;
};

/** Build domain entities for the demo clinic catalog (deterministic ids for idempotent seed). */
export function buildDemoClinicCatalog(
  clinicId: ClinicId,
  options: BuildDemoClinicCatalogOptions = {},
): DemoClinicCatalog {
  const specialtyByName = new Map<string, Specialty>();

  for (const seed of SPECIALTY_SEEDS) {
    const specialty = Specialty.create({
      id: asSpecialtyId(seed.id),
      name: seed.name,
      description: seed.description,
    });
    specialtyByName.set(seed.name, specialty);
  }

  const doctors = DOCTOR_SEEDS.map((seed) => {
    const specialtyIds = seed.specialtyKeys.map((name) => {
      const specialty = specialtyByName.get(name);
      if (!specialty) {
        throw new Error(`Unknown specialty key in doctor seed: ${name}`);
      }
      return specialty.id;
    });

    return Doctor.create({
      id: asDoctorId(seed.id),
      clinicId,
      fullName: seed.fullName,
      specialtyIds,
      bio: seed.bio,
      active: seed.active ?? true,
      calendarResourceId:
        options.calendarResourceId?.trim() || seed.calendarResourceId,
    });
  });

  return {
    clinicId,
    specialties: [...specialtyByName.values()],
    doctors,
  };
}

export const DEMO_CATALOG_COUNTS = {
  specialties: SPECIALTY_SEEDS.length,
  doctors: DOCTOR_SEEDS.length,
};
