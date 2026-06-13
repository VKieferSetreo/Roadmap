#!/usr/bin/env bash
# OSM Overpass — GST-Restriktionen Sachsen-Anhalt — offen, keine Auth.
# Beispiel: 1 Weg mit maxheight im Bereich Sachsen-Anhalt.
set -euo pipefail

QUERY='[out:json][timeout:25];way["maxheight"](52.05,11.55,52.20,11.75);out 1;'

curl -sSL --max-time 30 -A "RoadmapGST/1.0 (catalog test)" \
  --data-urlencode "data=${QUERY}" \
  "https://overpass-api.de/api/interpreter" \
  | head -c 4000
echo
