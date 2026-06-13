#!/usr/bin/env bash
# BASt BISStra — Bundesfernstraßennetz (ASB) — offener OGC-WFS, keine Auth.
# Beispiel: 1 Netzknoten (Netzknoten = NK) als Feature.
# WMS-Alternative: https://inspire.bast.de/bisstra/strasse_wms?service=WMS&request=GetCapabilities&version=1.3.0
set -euo pipefail

WFS="https://inspire.bast.de/bisstra/strasse_wfs"

echo "== Bundesfernstraße Netzknoten (WFS, 1 Feature) =="
curl -sSL --max-time 30 \
  "${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=bisstra.strasse:tbl_BFStr_NK&count=1" \
  | head -c 4000
echo
