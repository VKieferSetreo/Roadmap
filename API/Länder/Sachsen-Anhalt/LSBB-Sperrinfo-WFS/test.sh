#!/usr/bin/env bash
# Sachsen-Anhalt LSBB Sperrinfo WFS — technisch offen erreichbar, ABER non-commercial-Lizenz.
# Beispiel: 1 Feature aus roadworks als GeoJSON (EPSG:4326 nativ).
set -euo pipefail

BASE="https://service.ifak.eu/sperrinfo/wfs"

# outputFormat muss bei diesem MapServer "application/json; subtype=geojson" sein (URL-kodiert).
curl -sSL --max-time 30 \
  "${BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=roadworks&count=1&outputFormat=application/json;%20subtype=geojson" \
  | head -c 4000
echo
