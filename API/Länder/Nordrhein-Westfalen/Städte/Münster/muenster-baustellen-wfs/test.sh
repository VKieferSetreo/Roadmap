#!/usr/bin/env bash
# Münster — Baustellen (geo.stadt-muenster.de MapServer, WFS). Offen, keine Auth.
# Beispiel: 1 Baustellen-Feature als GeoJSON abrufen.
set -euo pipefail

URL="https://geo.stadt-muenster.de/mapserv/odbaustellen_serv?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=baustellen&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326&MAXFEATURES=1"

echo "== Münster Baustellen (WFS GeoJSON, MAXFEATURES=1) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
