#!/usr/bin/env bash
# OSM Overpass — GST-Restriktionen Berlin — offen, keine Auth.
# Beispiel: 1 Weg mit maxheight im Großraum Berlin (bbox Mitte).
set -euo pipefail

QUERY='[out:json][timeout:25];way["maxheight"](52.50,13.36,52.54,13.43);out 1;'

curl -sSL --max-time 30 -A "RoadmapGST/1.0 (catalog test)" \
  --data-urlencode "data=${QUERY}" \
  "https://overpass-api.de/api/interpreter" \
  | head -c 4000
echo
