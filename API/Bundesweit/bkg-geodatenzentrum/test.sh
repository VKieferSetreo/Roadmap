#!/usr/bin/env bash
# BKG Geodatenzentrum — INSPIRE Verkehrsnetze (DLM250) — offener OGC-WFS, keine Auth.
# Beispiel: 1 RoadLink (Straßennetz-Topologie) als GML.
# WMS-Pendant: https://sgx.geodatenzentrum.de/wms_dlm250_inspire?service=WMS&request=GetCapabilities
set -euo pipefail

WFS="https://sgx.geodatenzentrum.de/wfs_dlm250_inspire"

echo "== INSPIRE Verkehrsnetz RoadLink (WFS, 1 Feature) =="
curl -sSL --max-time 30 \
  "${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=tn-ro:RoadLink&count=1" \
  | head -c 4000
echo
