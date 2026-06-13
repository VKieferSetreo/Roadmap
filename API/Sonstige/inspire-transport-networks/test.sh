#!/usr/bin/env bash
# INSPIRE Transport Networks via BKG DLM250 WFS — offen, keine Auth.
# Beispiel: GetCapabilities (listet alle FeatureTypes: tn-ro:RoadLink, tn-ra:RailwayLink ...).
# Echte Daten danach: REQUEST=GetFeature&TYPENAMES=tn-ro:RoadLink&COUNT=1&SRSNAME=EPSG:25832&BBOX=...
set -euo pipefail

WFS="https://sgx.geodatenzentrum.de/wfs_dlm250_inspire"

echo "== WFS 2.0.0 GetCapabilities (FeatureType-Liste) =="
curl -sSL --max-time 30 "${WFS}?SERVICE=WFS&REQUEST=GetCapabilities&VERSION=2.0.0" \
  | head -c 4000
echo
