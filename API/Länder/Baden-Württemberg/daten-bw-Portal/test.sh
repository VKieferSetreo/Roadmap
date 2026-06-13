#!/usr/bin/env bash
# daten.bw — Open-Data-Portal BW (Meta-Katalog, kein maschineller Datenendpunkt).
# CKAN-API ist NICHT verfügbar (geprüft: HTTP 404). Test prüft nur, dass das Portal lebt.
# Lauffähig mit: bash test.sh

UA="Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
URL="https://www.daten-bw.de/"

curl -sSL --max-time 30 -A "$UA" -o /dev/null \
  -w "HTTP %{http_code}  type=%{content_type}\n" "$URL"
echo "# Gefilterte Datensatz-Suche im Browser:"
echo "# https://www.daten-bw.de/daten/-/searchresult/f/format:csv,format:geojson,format:datex+ii,format:wms%252Fwfs,type:dataset/s/title_asc"
