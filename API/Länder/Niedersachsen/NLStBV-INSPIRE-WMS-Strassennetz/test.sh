#!/usr/bin/env bash
# NLStBV INSPIRE WMS Straßennetz Niedersachsen — offen, keine Auth.
# Beispiel: GetCapabilities abrufen (WMS hat keinen Feature-Call; Layer-Liste statt count=1).
set -euo pipefail

BASE="https://map.strassenbau.niedersachsen.de/srvms?map=INSPIRE_NLSTBV_STRASSE&service=wms&version=1.3.0"

echo "== WMS GetCapabilities (Auszug: Layer-Namen) =="
curl -sSL --max-time 30 "${BASE}&request=GetCapabilities" | head -c 4000
echo
