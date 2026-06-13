#!/usr/bin/env bash
# MobiData BW IPL — Geoserver WFS. Beispiel: ein roadworks-Feature als GeoJSON.
# Offen, keine Registrierung. User-Agent-Header empfohlen.
# Lauffähig mit: bash test.sh

UA="Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
URL="https://api.mobidata-bw.de/geoserver/MobiData-BW/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=MobiData-BW:roadworks&count=1&outputFormat=application/json"

curl -sSL --max-time 30 -A "$UA" "$URL" | head -c 4000
echo
