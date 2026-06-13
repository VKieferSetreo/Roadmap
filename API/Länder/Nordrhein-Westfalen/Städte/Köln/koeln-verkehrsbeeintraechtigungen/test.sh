#!/usr/bin/env bash
# Köln — Verkehrsbeeinträchtigungen (Baustellen/Veranstaltungen/Sperrungen).
# Quelle hinter dem offenedaten-koeln.de-Datensatz ist der ArcGIS-Verkehrskalender
# der Stadt Köln (geoportal.stadt-koeln.de). Offen, keine Auth, GeoJSON EPSG:4326.
# Layer 0 = "Standort" (TYP-codierte Punkte). Weitere: 3 Verkehrslage, 1 Strecke, 2 Bereich.
set -euo pipefail

URL="https://geoportal.stadt-koeln.de/arcgis/rest/services/verkehr/verkehrskalender/MapServer/0/query?where=1=1&outFields=*&resultRecordCount=2&f=geojson"

echo "== Köln Verkehrsbeeinträchtigungen (ArcGIS Verkehrskalender, Layer 0 Standort, 2 Records) =="
curl -sSL --max-time 40 -A "Mozilla/5.0 (compatible)" "${URL}" | head -c 4000
echo
