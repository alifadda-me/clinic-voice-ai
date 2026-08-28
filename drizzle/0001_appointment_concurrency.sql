-- Appointment concurrency + idempotency hardening
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
DROP INDEX IF EXISTS "appointments_idempotency_key_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_idempotency_key_uidx" ON "appointments" USING btree ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_valid_range_chk";--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_valid_range_chk" CHECK ("ends_at" > "starts_at");--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_doctor_no_overlap_excl";--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_no_overlap_excl" EXCLUDE USING gist (
  "doctor_id" WITH =,
  tstzrange("starts_at", "ends_at", '[)') WITH &&
) WHERE ("status" = 'scheduled');--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_patient_no_overlap_excl";--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_no_overlap_excl" EXCLUDE USING gist (
  "patient_id" WITH =,
  tstzrange("starts_at", "ends_at", '[)') WITH &&
) WHERE ("status" = 'scheduled');
