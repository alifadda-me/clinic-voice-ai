#!/usr/bin/env bash
# db:reset:local — wipe clinic tables on the LOCAL Docker Postgres only.
# Refuses any DATABASE_URL that does not look like the compose default host/port.
set -euo pipefail

DEFAULT_URL='postgresql://clinic:clinic@localhost:54329/clinic_voice_ai'
URL="${DATABASE_URL:-$DEFAULT_URL}"

case "$URL" in
  *localhost:54329*|*127.0.0.1:54329*)
    ;;
  *)
    echo "Refusing db:reset:local — DATABASE_URL is not the local Docker URL (expected host port 54329)." >&2
    echo "Got: ${URL}" >&2
    exit 1
    ;;
esac

if [[ "${CONFIRM_LOCAL_DB_RESET:-}" != "yes" ]]; then
  echo "This DELETES local clinic data in Postgres."
  echo "Re-run with: CONFIRM_LOCAL_DB_RESET=yes npm run db:reset:local"
  exit 1
fi

echo "Truncating local clinic tables..."
docker exec -i clinic-voice-ai-postgres \
  psql -U clinic -d clinic_voice_ai <<'SQL'
TRUNCATE TABLE
  principal_patient_links,
  patient_preferences,
  appointments,
  doctor_specialties,
  doctors,
  specialties,
  patients,
  clinics
RESTART IDENTITY CASCADE;
SQL

echo "Local tables truncated. Re-seed doctors/patients as needed, then:"
echo "  npm run rebuild:derived"
