#!/usr/bin/env bash
# RVR / GEONETZWERK.RUHR — Baustellen (Beispiel Herne-GeoServer, WFS). Offen, keine Auth.
# ACHTUNG: Herne-Baustellen-Lizenz ggf. nicht offen — Nutzung separat klären.
# Beispiel: 1 Baustellen-Feature als GeoJSON abrufen.
set -euo pipefail

URL="https://geodaten.herne.de/geoserver/verkehr/baustellen?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=baustelle&OUTPUTFORMAT=GeoJSON&SRSNAME=EPSG:25832&MAXFEATURES=1"

echo "== RVR/Herne Baustellen (WFS GeoJSON, MAXFEATURES=1) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
