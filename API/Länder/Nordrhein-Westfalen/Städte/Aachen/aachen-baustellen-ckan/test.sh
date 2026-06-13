#!/usr/bin/env bash
# Aachen — Baustellen (BSIS, Baustellen-Informationssystem der Stadt Aachen).
# Offener WFS, keine Auth. Live-Daten (PUNKTE/LINIEN/FLAECHEN_ALLE).
# Hinweis: Das CKAN-Portal offenedaten.aachen.de lieferte beim Test 502, ABER
# der eigentliche Baustellen-WFS liegt eigenstaendig auf bsis.aachen.de/geoserver.
set -euo pipefail

URL="https://bsis.aachen.de/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=BSIS:PUNKTE_ALLE&count=1&outputFormat=application/json"

echo "== Aachen Baustellen (BSIS WFS, PUNKTE_ALLE, count=1) =="
curl -sSL --max-time 40 "${URL}" | head -c 4000
echo
