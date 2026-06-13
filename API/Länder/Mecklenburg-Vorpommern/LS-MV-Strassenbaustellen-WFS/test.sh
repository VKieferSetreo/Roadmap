#!/usr/bin/env bash
# MV Straßenbaustellen WFS (wfs_baustellenmv) — offen, keine Auth.
# Beispiel: 1 Feature aus baustellen:Baustellen.
set -euo pipefail

BASE="https://www.geodaten-mv.de/dienste/wfs_baustellenmv"

curl -sSL --max-time 30 \
  "${BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=baustellen:Baustellen&count=1" \
  | head -c 4000
echo
