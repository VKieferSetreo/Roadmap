#!/usr/bin/env bash
# OSM Overpass — GST-Restriktionen Thüringen — offen, keine Auth.
# Beispiel: 1 Weg mit maxheight im Bereich Thüringen.
set -euo pipefail

QUERY='[out:json][timeout:25];way["maxheight"](50.95,11.00,51.05,11.10);out 1;'

curl -sSL --max-time 30 -A "RoadmapGST/1.0 (catalog test)" \
  --data-urlencode "data=${QUERY}" \
  "https://overpass-api.de/api/interpreter" \
  | head -c 4000
echo
