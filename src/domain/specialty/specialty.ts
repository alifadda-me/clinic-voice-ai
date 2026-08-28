import type { SpecialtyId } from '../shared/ids.js';

export type SpecialtyProps = {
  id: SpecialtyId;
  name: string;
  description?: string | undefined;
};

export class Specialty {
  readonly id: SpecialtyId;
  readonly name: string;
  readonly description: string | undefined;

  private constructor(props: SpecialtyProps) {
    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
  }

  static create(props: SpecialtyProps): Specialty {
    if (!props.name.trim()) {
      throw new Error('Specialty name is required');
    }
    return new Specialty({
      id: props.id,
      name: props.name.trim(),
      description: props.description?.trim() || undefined,
    });
  }
}
