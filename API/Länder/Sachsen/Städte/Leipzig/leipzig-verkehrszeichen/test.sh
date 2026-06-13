#!/usr/bin/env bash
# Leipzig — Verkehrszeichen-Kataster (GeoServer, WFS). Offen, keine Auth.
# Beispiel: 1 Verkehrszeichen-Feature als GeoJSON abrufen.
set -euo pipefail

URL="https://geodienste.leipzig.de/l3/OpenData/wfs?VERSION=2.0.0&REQUEST=GetFeature&typeName=OpenData%3Averkehrszeichen&outputFormat=application/json&count=1"

echo "== Leipzig Verkehrszeichen (WFS GeoJSON, count=1) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
