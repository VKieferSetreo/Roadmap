#!/usr/bin/env bash
# Leipzig — Verkehrsraumeinschränkungen (GeoServer, WFS). Offen, keine Auth.
# Beispiel: 1 Einschränkungs-Punkt als GeoJSON abrufen.
set -euo pipefail

URL="https://geodienste.leipzig.de/l3/OpenData/wfs?VERSION=2.0.0&REQUEST=GetFeature&typeName=OpenData%3AVerkehrsraumeinschraenkungen_point&outputFormat=application/json&count=1"

echo "== Leipzig Verkehrsraumeinschränkungen Punkte (WFS GeoJSON, count=1) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
