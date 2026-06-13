#!/usr/bin/env bash
# Brandenburg ALKIS WMS — offen, keine Auth.
# Beispiel: WMS GetCapabilities (Layer-Übersicht). WMS hat keinen GetFeature-Call wie WFS.
set -euo pipefail

BASE="https://isk.geobasis-bb.de/ows/alkis_wms"

curl -sSL --max-time 30 \
  "${BASE}?service=WMS&version=1.3.0&request=GetCapabilities" \
  | head -c 4000
echo
