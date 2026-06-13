#!/usr/bin/env bash
# München — Baustellen (GeoPortal GeoServer, WFS). Offen, keine Auth.
# Beispiel: 1 Baustellen-Feature als GeoJSON abrufen.
set -euo pipefail

URL="https://geoportal.muenchen.de/geoserver/mor_wfs/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=mor_wfs:baustellen_opendata&outputFormat=application/json&maxFeatures=1"

echo "== München Baustellen (WFS GeoJSON, maxFeatures=1) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
