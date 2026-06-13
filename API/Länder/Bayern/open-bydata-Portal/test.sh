#!/usr/bin/env bash
# open.bydata — Open-Data-Portal Bayern (Meta-Katalog, JS-gerendertes SPA).
# Keine bestätigte CKAN/DCAT-API an Standardpfaden. Test prüft nur, dass das Portal lebt.
# Lauffähig mit: bash test.sh

UA="Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
URL="https://open.bydata.de/"

curl -sSL --max-time 30 -A "$UA" -o /dev/null \
  -w "HTTP %{http_code}  type=%{content_type}\n" "$URL"
echo "# Datensätze im Browser durchsuchen; CKAN/DCAT-Harvest-Endpunkt in Implementierung klären."
