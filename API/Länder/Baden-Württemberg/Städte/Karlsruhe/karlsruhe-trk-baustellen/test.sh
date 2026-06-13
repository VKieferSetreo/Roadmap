#!/usr/bin/env bash
# Karlsruhe / TRK — Baustellen (TRK-GeoServer, WFS). Offen, keine Auth.
# Beispiel: 1 aktuelles Baustellen-Feature als GeoJSON abrufen.
set -euo pipefail

URL="https://mobil.trk.de/geoserver/TBA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=TBA%3Abaustellen_aktuell&outputFormat=application%2Fjson&maxFeatures=1"

echo "== Karlsruhe/TRK Baustellen aktuell (WFS GeoJSON, maxFeatures=1) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
