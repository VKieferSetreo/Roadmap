#!/usr/bin/env bash
# Nominatim (OSM) — offen, keine Auth. STRIKTE Usage-Policy: max 1 req/s, kein Bulk,
# gueltiger User-Agent Pflicht. Beispiel: Forward-Geocoding einer Adresse.
set -euo pipefail

BASE="https://nominatim.openstreetmap.org"
UA="Roadmap-Setreo-API-Catalog/1.0 (klattigmaximilian@gmail.com)"

echo "== search: Brandenburger Tor, Berlin =="
curl -sSL --max-time 30 \
  -H "User-Agent: ${UA}" \
  "${BASE}/search?q=Brandenburger+Tor%2C+Berlin&format=jsonv2&limit=1&addressdetails=1" \
  | head -c 4000
echo
