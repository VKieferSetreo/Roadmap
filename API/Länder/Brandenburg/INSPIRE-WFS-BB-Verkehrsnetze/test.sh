#!/usr/bin/env bash
# Brandenburg INSPIRE Verkehrsnetze WFS (tn_bdlm_wfs) — offen, keine Auth.
# Beispiel: 1 Feature des ersten Verkehrsnetz-FeatureTypes (RoadLink) als GML.
set -euo pipefail

BASE="https://inspire.brandenburg.de/services/tn_bdlm_wfs"

curl -sSL --max-time 30 \
  "${BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=tn-ro:RoadLink&count=1" \
  | head -c 4000
echo
