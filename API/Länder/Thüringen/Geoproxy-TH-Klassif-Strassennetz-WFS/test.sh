#!/usr/bin/env bash
# Thüringen Klassifiziertes Straßennetz WFS (STRNETZ_wfs) — offen, keine Auth.
# Beispiel: 1 Feature aus tlbv:Klassifiz_StrNetz als GML.
# Dienst unterstützt nur WFS 1.1.0 (→ typeName/maxFeatures statt typeNames/count).
set -euo pipefail

BASE="https://www.geoproxy.geoportal-th.de/geoproxy/services/STRNETZ_wfs"

curl -sSL --max-time 30 \
  "${BASE}?service=WFS&version=1.1.0&request=GetFeature&typeName=tlbv:Klassifiz_StrNetz&maxFeatures=1" \
  | head -c 4000
echo
