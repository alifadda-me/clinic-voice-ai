export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(prefix?: string): string;
}
