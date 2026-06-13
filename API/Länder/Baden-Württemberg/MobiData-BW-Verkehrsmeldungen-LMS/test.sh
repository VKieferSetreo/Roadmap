#!/usr/bin/env bash
# MobiData BW IPL — Verkehrsmeldungen (LMS BW), TIC3-XML-Feed.
# Offen, keine Registrierung. User-Agent-Header empfohlen.
# Lauffähig mit: bash test.sh

UA="Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
URL="https://api.mobidata-bw.de/datasets/traffic/incidents-bw/TIC3-Meldungen.xml"

curl -sSL --max-time 30 -A "$UA" "$URL" | head -c 4000
echo
