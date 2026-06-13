#!/usr/bin/env bash
# Sachsen-Anhalt LVermGeo INSPIRE Verkehrsnetze WFS — offen, keine Auth.
# Beispiel: 1 Feature aus tn-ro:RoadLink als GML.
set -euo pipefail

BASE="https://geodatenportal.sachsen-anhalt.de/ows_INSPIRE_LVermGeo_ATKIS_TN_WFS"

curl -sSL --max-time 30 \
  "${BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=tn-ro:RoadLink&count=1" \
  | head -c 4000
echo
