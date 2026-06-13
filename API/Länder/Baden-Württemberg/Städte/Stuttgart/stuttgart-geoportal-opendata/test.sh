#!/usr/bin/env bash
# Stuttgart — Baustellen (Open Data Stuttgart, CKAN-Datensatz "baustellen").
# Daten liegen auf geoserver.stuttgart.de (Workspace Verkehr_Mobilitaet). Offen, keine Auth.
# Zwei Layer: ..._im_Bau_... (aktuell) und ..._geplant_... (geplant). GeoJSON via outputFormat.
set -euo pipefail

URL="https://geoserver.stuttgart.de/gdc/Verkehr_Mobilitaet/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=Verkehr_Mobilitaet:A66_BAUM_BAUSTELLEN_DATE_WEB_im_Bau_EPSG25832&count=1&outputFormat=application/json"

echo "== Stuttgart Baustellen (geoserver.stuttgart.de WFS, im Bau, count=1) =="
curl -sSL --max-time 40 -A "Mozilla/5.0 (compatible)" "${URL}" | head -c 4000
echo
