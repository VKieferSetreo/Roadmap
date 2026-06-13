#!/usr/bin/env bash
# Thüringen INSPIRE Verkehrsnetze (Straße) WFS (INSPIREtn-ro_wfs) — offen, keine Auth.
# Beispiel: 1 Feature aus tn-ro:RoadLink als INSPIRE-GML (WFS 2.0.0).
set -euo pipefail

BASE="https://www.geoproxy.geoportal-th.de/geoproxy/services/INSPIREtn-ro_wfs"

curl -sSL --max-time 30 \
  "${BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=tn-ro:RoadLink&count=1" \
  | head -c 4000
echo
