#!/usr/bin/env bash
# BAYSIS Bauwerke — WFS GetFeature, ein Brücken-/Tunnel-/Trogbauwerk als GeoJSON.
# Offen, CC BY 4.0, keine Registrierung. Liefert strukturierte GST-Felder
# (Höhenbeschränkung, Gewichtsbeschränkung, Brückenklasse, Schwertransportsperre).
# Lauffähig mit: bash test.sh

UA="Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
URL="https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Bauwerke/MapServer/WFSServer?service=WFS&version=2.0.0&request=GetFeature&typeNames=BAYSIS_Bauwerke:bauwerke&count=1&outputFormat=GEOJSON"

curl -sSL --max-time 30 -A "$UA" "$URL" | head -c 4000
echo
