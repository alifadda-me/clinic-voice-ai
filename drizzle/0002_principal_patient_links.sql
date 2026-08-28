-- durable principal → patient mapping
CREATE TABLE IF NOT EXISTS "principal_patient_links" (
  "subject_id" text PRIMARY KEY NOT NULL,
  "patient_id" uuid NOT NULL,
  "linked_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "principal_patient_links"
    ADD CONSTRAINT "principal_patient_links_patient_id_patients_id_fk"
    FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "principal_patient_links_patient_id_uidx"
  ON "principal_patient_links" USING btree ("patient_id");
