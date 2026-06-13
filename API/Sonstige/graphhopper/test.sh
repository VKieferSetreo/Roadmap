#!/usr/bin/env bash
# GraphHopper Directions API (truck) — GATED: laeuft erst mit API-Key (siehe graphhopper.env).
# Beispiel: Truck-Route Berlin->Potsdam, GST-Dimensionen via custom_model (max_height/width/weight/axle_load).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
[ -f "${DIR}/graphhopper.env" ] && source "${DIR}/graphhopper.env"

if [ -z "${GRAPHHOPPER_API_KEY:-}" ]; then
  echo "GRAPHHOPPER_API_KEY fehlt — Account anlegen (https://www.graphhopper.com/dashboard/#/register) und Key in graphhopper.env eintragen."
  echo "Danach erneut: bash test.sh"
  exit 0
fi

echo "== GraphHopper truck: Berlin -> Potsdam mit GST-Dimensionen =="
curl -sSL --max-time 30 \
  -X POST "https://graphhopper.com/api/1/route?key=${GRAPHHOPPER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
        "profile": "truck",
        "points": [[13.388860,52.517037],[13.058919,52.400953]],
        "ch.disable": true,
        "custom_model": {
          "speed": [],
          "priority": [
            { "if": "max_height < 4.2", "multiply_by": "0" },
            { "if": "max_width < 2.55", "multiply_by": "0" },
            { "if": "max_weight < 40",  "multiply_by": "0" }
          ]
        }
      }' \
  | head -c 4000
echo
