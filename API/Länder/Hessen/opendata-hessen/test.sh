#!/usr/bin/env bash
# opendata.hessen.de — CKAN-API (Open-Data-Portal Hessen)
# Offen, kein Key. WICHTIG: KEINEN Browser-User-Agent setzen (Anti-Bot-Wall blockt Browser-UAs).
# Sucht 1 Datensatz in der Gruppe "verkehr".
curl -sSL --max-time 30 \
  "https://opendata.hessen.de/api/3/action/package_search?rows=1&fq=groups:verkehr" \
  | head -c 4000
