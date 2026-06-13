#!/usr/bin/env bash
# Aachen — Baustellen Stadtgebiet (CKAN package_show). Offen, keine Auth.
# HINWEIS: CKAN-API lieferte beim Erstellen transient HTTP 502. Bei Erreichbarkeit
# listet package_show alle Resource-URLs (WFS/WMS/CSV) des Datensatzes.
set -euo pipefail

URL="https://offenedaten.aachen.de/api/3/action/package_show?id=baustellen-stadtgebiet-aachen"

echo "== Aachen Baustellen (CKAN package_show) =="
curl -sSL --max-time 30 "${URL}" | head -c 4000
echo
