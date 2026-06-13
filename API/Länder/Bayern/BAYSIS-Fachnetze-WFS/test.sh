#!/usr/bin/env bash
# BAYSIS Fachnetze — WFS GetFeature, eine bedarfsabhängige Umleitung als GeoJSON.
# Bedarfsumleitungen = mögliche GST-Alternativrouten. Offen, CC BY 4.0, keine Registrierung.
# Lauffähig mit: bash test.sh

UA="Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
URL="https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Fachnetze/MapServer/WFSServer?service=WFS&version=2.0.0&request=GetFeature&typeNames=BAYSIS_Fachnetze:bedarfsumleitungen&count=1&outputFormat=GEOJSON"

curl -sSL --max-time 30 -A "$UA" "$URL" | head -c 4000
echo
