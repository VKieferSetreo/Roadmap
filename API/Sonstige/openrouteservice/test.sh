#!/usr/bin/env bash
# openrouteservice driving-hgv — GATED: laeuft erst mit API-Key (siehe openrouteservice.env).
# Beispiel: HGV-Route Berlin->Potsdam mit GST-Restriktionen (height 4.2 m, weight 40 t, axleload 11.5 t).
set -euo pipefail

# .env laden (ORS_API_KEY)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
[ -f "${DIR}/openrouteservice.env" ] && source "${DIR}/openrouteservice.env"

if [ -z "${ORS_API_KEY:-}" ]; then
  echo "ORS_API_KEY fehlt — Account anlegen (https://account.heigit.org/signup) und Key in openrouteservice.env eintragen."
  echo "Danach erneut: bash test.sh"
  exit 0
fi

echo "== ORS driving-hgv: Berlin -> Potsdam mit GST-Restriktionen =="
curl -sSL --max-time 30 \
  -X POST "https://api.openrouteservice.org/v2/directions/driving-hgv" \
  -H "Authorization: ${ORS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
        "coordinates": [[13.388860,52.517037],[13.058919,52.400953]],
        "profile_params": { "restrictions": { "height": 4.2, "width": 2.55, "weight": 40, "axleload": 11.5 } }
      }' \
  | head -c 4000
echo
