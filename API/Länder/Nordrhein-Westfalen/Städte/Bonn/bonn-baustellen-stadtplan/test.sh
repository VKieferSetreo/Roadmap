#!/usr/bin/env bash
# Bonn — Baustellen tagesaktuell (stadtplan.bonn.de GeoJSON). Offen, keine Auth.
# Beispiel: tagesaktuelle Baustellen abrufen (Anfang ausgeben). Thema=14403.
set -euo pipefail

URL="https://stadtplan.bonn.de/geojson?Thema=14403"

echo "== Bonn Baustellen tagesaktuell (GeoJSON, Thema=14403) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
