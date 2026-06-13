#!/usr/bin/env bash
# BAYSIS Straßenbestand — WFS GetFeature, ein "fahrbahnbreiten"-Feature als GeoJSON.
# Fahrbahnbreiten = GST-relevante Breiten-Engstellen. Offen, CC BY 4.0, keine Registrierung.
# Lauffähig mit: bash test.sh

UA="Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
URL="https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Strassenbestand/MapServer/WFSServer?service=WFS&version=2.0.0&request=GetFeature&typeNames=BAYSIS_Strassenbestand:fahrbahnbreiten&count=1&outputFormat=GEOJSON"

curl -sSL --max-time 30 -A "$UA" "$URL" | head -c 4000
echo
