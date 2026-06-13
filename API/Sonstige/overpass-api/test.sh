#!/usr/bin/env bash
# Overpass API (FOSSGIS) — offen, keine Auth (User-Agent-Header gefordert).
# Beispiel: Hoehenbeschraenkte Wege (maxheight) in einer winzigen Bbox in Berlin-Mitte.
# Bbox-Reihenfolge in Overpass: (sued, west, nord, ost).
set -euo pipefail

ENDPOINT="https://overpass-api.de/api/interpreter"
UA="Roadmap-Setreo-API-Catalog/1.0 (klattigmaximilian@gmail.com)"

echo "== maxheight-Ways in Berlin-Mitte-Bbox =="
curl -sSL --max-time 30 \
  -H "User-Agent: ${UA}" \
  -X POST "${ENDPOINT}" \
  --data-urlencode 'data=[out:json][timeout:25];way["maxheight"](52.515,13.375,52.525,13.395);out tags geom 5;' \
  | head -c 4000
echo
