#!/usr/bin/env bash
# Berlin Detailnetz Bauwerke WFS — offen, keine Auth.
# Beispiel: 1 Bauwerk (Brücke/Tunnel) aus detailnetz:b_bauwerke als GML.
set -euo pipefail

BASE="https://gdi.berlin.de/services/wfs/detailnetz"

curl -sSL --max-time 30 \
  "${BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=detailnetz:b_bauwerke&count=1" \
  | head -c 4000
echo
