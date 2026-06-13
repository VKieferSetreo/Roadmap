#!/usr/bin/env bash
# Sachsen Baustellen WMS (wms_list_baustellen) — offen, keine Auth.
# WMS hat keinen GetFeature wie WFS — daher GetCapabilities (Layer-Übersicht: sperrungen, umleitungen).
set -euo pipefail

BASE="https://geodienste.sachsen.de/wms_list_baustellen/guest"

curl -sSL --max-time 30 \
  "${BASE}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities" \
  | head -c 4000
echo
