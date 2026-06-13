#!/usr/bin/env bash
# Sachsen GeoSN INSPIRE Verkehrsnetze WFS — offen, keine Auth.
# Beispiel: 1 Feature aus tn-ro:RoadLink als GML.
set -euo pipefail

BASE="https://geodienste.sachsen.de/aaa/public_inspire/atkis-bdlm/tn/dls/wfs"

curl -sSL --max-time 30 \
  "${BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=tn-ro:RoadLink&count=1" \
  | head -c 4000
echo
