#!/usr/bin/env bash
# DigitalerAtlasNord (DANord) / GDI-SH — der Viewer liegt auf dem offenen WFS
# WFS_SH_Baustelleninformationen (dienste.gdi-sh.de). Dieser Call holt EINE
# Baustelle (Bundes-/Land-/BAB) als GeoJSON. Offen, keine Auth.
set -euo pipefail

BASE="https://dienste.gdi-sh.de/WFS_SH_Baustelleninformationen"

echo "== WFS_SH_Baustelleninformationen: GetFeature Baustellen_SH count=1 (GeoJSON) =="
curl -sSL --max-time 60 \
  "${BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=Baustelleninformationen:Baustellen_SH&COUNT=1&OUTPUTFORMAT=GEOJSON" \
  | head -c 2000
echo
