#!/usr/bin/env bash
# Rostock — Baustellen (OpenData.HRO, CKAN). Offen, keine Auth.
# Beispiel: CKAN package_show — listet alle Resource-URLs (GeoJSON/WFS/CSV/...) des Datensatzes.
set -euo pipefail

URL="https://www.opendata-hro.de/api/3/action/package_show?id=baustellen"

echo "== Rostock Baustellen (CKAN package_show) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
