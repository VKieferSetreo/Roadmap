#!/usr/bin/env bash
# Berlin VIZ Baustellen/Sperrungen WFS — offen, keine Auth.
# Beispiel: 1 Feature aus mdhwfs:baustellen_sperrungen als GeoJSON.
set -euo pipefail

BASE="https://api.viz.berlin.de/geoserver/mdhwfs/wfs"

curl -sSL --max-time 30 \
  "${BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=mdhwfs:baustellen_sperrungen&count=1&outputFormat=application/json" \
  | head -c 4000
echo
