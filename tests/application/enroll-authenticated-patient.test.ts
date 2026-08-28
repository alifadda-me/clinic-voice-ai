import { beforeEach, describe, expect, it } from 'vitest';
import { EnrollAuthenticatedPatient } from '../../src/application/identity/enroll-authenticated-patient.js';
import { LinkPrincipalToPatient } from '../../src/application/identity/link-principal-to-patient.js';
import { ConflictError } from '../../src/application/shared/errors.js';
import { InMemoryPrincipalPatientDirectory } from '../../src/infrastructure/memory/clinic/principal-patient-directory.js';
import { createTestWorld, type TestWorld } from '../helpers/test-world.js';

describe('EnrollAuthenticatedPatient', () => {
  let world: TestWorld;
  let directory: InMemoryPrincipalPatientDirectory;
  let enroll: EnrollAuthenticatedPatient;
  let link: LinkPrincipalToPatient;

  beforeEach(async () => {
    world = createTestWorld();
    await world.seed();
    directory = new InMemoryPrincipalPatientDirectory();
    link = new LinkPrincipalToPatient(directory, world.patients);
    enroll = new EnrollAuthenticatedPatient(
      world.useCases.registerPatient,
      link,
      directory,
    );
  });

  it('creates patient and auto-links when principal has no link', async () => {
    const result = await enroll.execute({
      principal: { subjectId: 'sub-new' },
      phoneNumber: '+201011119001',
      fullName: 'New Patient',
    });
    expect(result.created).toBe(true);
    expect(result.linked).toBe(true);
    expect(await directory.findPatientId('sub-new')).toBe(result.patientId);
  });

  it('does not auto-link when phone matches an existing patient', async () => {
    await world.useCases.registerPatient.execute({
      phoneNumber: '+201011119002',
      fullName: 'Existing',
    });

    await expect(
      enroll.execute({
        principal: { subjectId: 'sub-attacker' },
        phoneNumber: '+201011119002',
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await directory.findPatientId('sub-attacker')).toBeNull();
  });

  it('does not rebind when principal already linked', async () => {
    const first = await enroll.execute({
      principal: { subjectId: 'sub-bound' },
      phoneNumber: '+201011119003',
      fullName: 'Bound',
    });

    const second = await enroll.execute({
      principal: { subjectId: 'sub-bound' },
      phoneNumber: '+201011119004',
      fullName: 'Other',
    });

    expect(second.linked).toBe(false);
    expect(second.patientId).toBe(first.patientId);
    expect(await directory.findPatientId('sub-bound')).toBe(first.patientId);
  });

  it('explicit LinkPrincipalToPatient links existing patient outside tools', async () => {
    const registered = await world.useCases.registerPatient.execute({
      phoneNumber: '+201011119005',
      fullName: 'Ops',
    });
    await link.execute({
      principal: { subjectId: 'sub-ops' },
      patientId: registered.patient.id,
    });
    expect(await directory.findPatientId('sub-ops')).toBe(
      registered.patient.id,
    );
  });
});
