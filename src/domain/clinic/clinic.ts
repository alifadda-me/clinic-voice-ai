import type { ClinicId } from '../shared/ids.js';

export type ClinicProps = {
  id: ClinicId;
  name: string;
  timezone: string;
};

/**
 * Clinic is the organizational context for doctors and appointments.
 * Timezone is clinic-owned so scheduling rules are not provider-specific.
 */
export class Clinic {
  readonly id: ClinicId;
  readonly name: string;
  readonly timezone: string;

  private constructor(props: ClinicProps) {
    this.id = props.id;
    this.name = props.name;
    this.timezone = props.timezone;
  }

  static create(props: ClinicProps): Clinic {
    if (!props.name.trim()) {
      throw new Error('Clinic name is required');
    }
    if (!props.timezone.trim()) {
      throw new Error('Clinic timezone is required');
    }
    return new Clinic({
      id: props.id,
      name: props.name.trim(),
      timezone: props.timezone.trim(),
    });
  }
}
