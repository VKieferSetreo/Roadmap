#!/usr/bin/env bash
# Dortmund — Baustellen (Opendatasoft Explore API v2.1). Offen, keine Auth.
# Beispiel: 2 tagesaktuelle Baustellen als JSON-Records abrufen.
set -euo pipefail

URL="https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets/fb66-baustellen-tagesaktuell/records?limit=2"

echo "== Dortmund Baustellen tagesaktuell (records, limit=2) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
