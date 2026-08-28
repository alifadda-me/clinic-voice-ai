import {
  FixedClock,
  SequentialIdGenerator,
  InMemoryPatientRepository,
  InMemoryDoctorRepository,
  InMemorySpecialtyRepository,
  InMemoryPreferenceRepository,
  InMemoryAppointmentRepository,
  InMemoryCalendarGateway,
  InMemoryEmbeddingProvider,
  InMemorySemanticSearch,
  InMemoryKnowledgeGraph,
} from '../../src/infrastructure/memory/index.js';
import {
  Clinic,
  Doctor,
  Specialty,
  asClinicId,
  asDoctorId,
  asSpecialtyId,
} from '../../src/domain/index.js';
import {
  RegisterPatient,
  GetPatientProfile,
  SavePatientPreference,
  GetPatientContext,
  FindDoctors,
  SearchDoctors,
  SearchSpecialties,
  RebuildDoctorSearchIndex,
  RebuildSpecialtySearchIndex,
  RebuildPatientAffinityGraph,
  SuggestDoctorsFromPeerAffinity,
  GetAvailableAppointments,
  BookAppointment,
  CancelAppointment,
  RescheduleAppointment,
  CompleteAppointment,
} from '../../src/application/index.js';

export function createTestWorld(now = new Date('2026-08-24T09:00:00.000Z')) {
  const clock = new FixedClock(now);
  const ids = new SequentialIdGenerator();

  const patients = new InMemoryPatientRepository();
  const doctors = new InMemoryDoctorRepository();
  const specialties = new InMemorySpecialtyRepository();
  const preferences = new InMemoryPreferenceRepository();
  const appointments = new InMemoryAppointmentRepository();
  const calendar = new InMemoryCalendarGateway();
  const embeddings = new InMemoryEmbeddingProvider();
  const semanticSearch = new InMemorySemanticSearch();
  const knowledgeGraph = new InMemoryKnowledgeGraph();

  const clinic = Clinic.create({
    id: asClinicId('clinic_1'),
    name: 'Demo Clinic',
    timezone: 'Africa/Cairo',
  });

  const cardiology = Specialty.create({
    id: asSpecialtyId('spec_cardio'),
    name: 'Cardiology',
    description: 'Heart and cardiovascular care',
  });
  const dermatology = Specialty.create({
    id: asSpecialtyId('spec_derm'),
    name: 'Dermatology',
    description: 'Skin care',
  });

  const drSara = Doctor.create({
    id: asDoctorId('doc_sara'),
    clinicId: clinic.id,
    fullName: 'Dr Sara Hassan',
    specialtyIds: [cardiology.id],
    bio: 'Senior cardiologist',
    calendarResourceId: 'cal_doc_sara',
  });
  const drOmar = Doctor.create({
    id: asDoctorId('doc_omar'),
    clinicId: clinic.id,
    fullName: 'Dr Omar Nabil',
    specialtyIds: [dermatology.id],
    bio: 'Dermatologist',
  });
  const inactive = Doctor.create({
    id: asDoctorId('doc_inactive'),
    clinicId: clinic.id,
    fullName: 'Dr Inactive',
    specialtyIds: [cardiology.id],
    active: false,
  });

  return {
    clock,
    ids,
    clinic,
    patients,
    doctors,
    specialties,
    preferences,
    appointments,
    calendar,
    embeddings,
    semanticSearch,
    knowledgeGraph,
    seed: async () => {
      await specialties.save(cardiology);
      await specialties.save(dermatology);
      await doctors.save(drSara);
      await doctors.save(drOmar);
      await doctors.save(inactive);

      await new RebuildSpecialtySearchIndex(
        specialties,
        semanticSearch,
        embeddings,
      ).execute();
      await new RebuildDoctorSearchIndex(
        doctors,
        specialties,
        semanticSearch,
        embeddings,
      ).execute();

      return { cardiology, dermatology, drSara, drOmar, inactive };
    },
    useCases: {
      registerPatient: new RegisterPatient(patients, ids, clock),
      getPatientProfile: new GetPatientProfile(patients),
      savePatientPreference: new SavePatientPreference(
        patients,
        preferences,
        specialties,
        doctors,
        ids,
        clock,
      ),
      getPatientContext: new GetPatientContext(
        patients,
        preferences,
        appointments,
      ),
      findDoctors: new FindDoctors(doctors),
      searchDoctors: new SearchDoctors(doctors, semanticSearch, embeddings),
      suggestDoctorsFromPeerAffinity: new SuggestDoctorsFromPeerAffinity(
        patients,
        doctors,
        knowledgeGraph,
      ),
      searchSpecialties: new SearchSpecialties(
        specialties,
        semanticSearch,
        embeddings,
      ),
      rebuildDoctorSearchIndex: new RebuildDoctorSearchIndex(
        doctors,
        specialties,
        semanticSearch,
        embeddings,
      ),
      rebuildSpecialtySearchIndex: new RebuildSpecialtySearchIndex(
        specialties,
        semanticSearch,
        embeddings,
      ),
      rebuildPatientAffinityGraph: new RebuildPatientAffinityGraph(
        preferences,
        appointments,
        knowledgeGraph,
      ),
      getAvailableAppointments: new GetAvailableAppointments(
        doctors,
        calendar,
        clock,
      ),
      bookAppointment: new BookAppointment(
        patients,
        doctors,
        appointments,
        calendar,
        ids,
        clock,
      ),
      cancelAppointment: new CancelAppointment(appointments, calendar, clock),
      rescheduleAppointment: new RescheduleAppointment(
        appointments,
        doctors,
        calendar,
        clock,
      ),
      completeAppointment: new CompleteAppointment(appointments, clock),
    },
  };
}

export type TestWorld = ReturnType<typeof createTestWorld>;
