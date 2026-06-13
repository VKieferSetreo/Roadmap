#!/usr/bin/env bash
# Transparenzportal Hamburg — CKAN-API (Dachkatalog). Offen, keine Auth.
# Beispiel: Datensätze der Gruppe "transport-und-verkehr" suchen (rows=1).
set -euo pipefail

BASE="https://suche.transparenz.hamburg.de/api/3/action/package_search"

echo "== CKAN package_search: groups=transport-und-verkehr (rows=1) =="
curl -sSL --max-time 30 "${BASE}?q=groups:transport-und-verkehr&rows=1" | head -c 4000
echo
