#!/usr/bin/env bash
# Düsseldorf — Verkehrsmeldungen (statisches GeoJSON, DATEX-II-Schema). Offen, keine Auth.
# Beispiel: GeoJSON-Datei abrufen (Anfang ausgeben).
set -euo pipefail

URL="https://opendata.duesseldorf.de/sites/default/files/publ-2056000_Verkehrsmeldungen_Geodaten.geojson"

echo "== Düsseldorf Verkehrsmeldungen (GeoJSON, DATEX-II) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
