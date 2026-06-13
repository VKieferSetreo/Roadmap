#!/usr/bin/env bash
# Rostock — GST-Routen / gesperrte Ingenieurbauwerke (OpenData.HRO). Offen, keine Auth.
# Beispiel: GeoJSON der für GST gesperrten Ingenieurbauwerke (§34 StVZO) abrufen.
set -euo pipefail

URL="https://geo.sv.rostock.de/download/opendata/grossraum_schwertransportrouten/grossraum_schwertransportrouten_ingenieurbauwerke.json"

echo "== Rostock gesperrte Ingenieurbauwerke für GST (GeoJSON) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
