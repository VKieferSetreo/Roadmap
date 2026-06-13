#!/usr/bin/env bash
# Geofabrik DE-Extrakte — offen, keine Auth. BULK-Download (~4,8 GB), daher hier nur
# ein HEAD-Request: zeigt 302-Redirect auf den datierten PBF + Content-Length, OHNE
# die Datei tatsaechlich herunterzuladen. Fuer echten Bezug: curl -O <germany-latest.osm.pbf>.
set -euo pipefail

PBF="https://download.geofabrik.de/europe/germany-latest.osm.pbf"

echo "== HEAD germany-latest.osm.pbf (Redirect + Groesse, kein Download) =="
curl -sSL --max-time 30 -I "${PBF}" | head -c 4000
echo
