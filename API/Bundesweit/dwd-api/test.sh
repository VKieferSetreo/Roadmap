#!/usr/bin/env bash
# DWD Wetterwarnungen — offener OGC-WFS (DWD GeoServer), keine Auth.
# Beispiel: 1 aktuelle Gemeinde-Wetterwarnung als GeoJSON (count=1).
# Hinweis: die alten warnwetter.de-App-Endpunkte (v30/warnings_nowcast.json) sind
# nicht mehr offen abrufbar; der stabile offene Weg ist der DWD-GeoServer-WFS.
set -euo pipefail

WFS="https://maps.dwd.de/geoserver/dwd/ows"

echo "== Aktuelle Wetterwarnungen Gemeinden (WFS, GeoJSON, 1 Feature) =="
curl -sSL --max-time 30 \
  "${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeName=dwd:Warnungen_Gemeinden&count=1&outputFormat=application/json" \
  | head -c 4000
echo
