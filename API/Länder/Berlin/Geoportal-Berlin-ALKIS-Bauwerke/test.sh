#!/usr/bin/env bash
# Geoportal Berlin (Nachfolger FIS-Broker) — Detailnetz-Bauwerke (Brücken/Tunnel).
# Migrierter Dienst auf gdi.berlin.de (FIS-Broker abgeschaltet 01.12.2025).
# Dieser Call holt EIN Bauwerk (b_bauwerke) als GeoJSON. Offen, keine Auth.
set -euo pipefail

BASE="https://gdi.berlin.de/services/wfs/detailnetz"

echo "== Detailnetz Berlin: GetFeature b_bauwerke count=1 (GeoJSON) =="
curl -sSL --max-time 60 \
  "${BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=detailnetz:b_bauwerke&count=1&outputFormat=application/json" \
  | head -c 2000
echo
