#!/usr/bin/env bash
# Mannheim — Open Data (Opendatasoft Explore API v2.1). Offen, keine Auth.
# Beispiel: Katalog-Discovery — 2 Datensätze listen. (Kein offener Baustellen-Datensatz vorhanden.)
set -euo pipefail

URL="https://mannheim.opendatasoft.com/api/explore/v2.1/catalog/datasets?limit=2"

echo "== Mannheim Open Data Katalog (Opendatasoft, limit=2) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
