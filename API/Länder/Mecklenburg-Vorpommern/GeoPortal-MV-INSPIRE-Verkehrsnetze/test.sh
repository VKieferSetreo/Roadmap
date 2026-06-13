#!/usr/bin/env bash
# INSPIRE-WFS MV Verkehrsnetze (ATKIS Basis-DLM), LAiV M-V — offen, keine Auth.
# Aufgelöster Download-WFS auf www.geodaten-mv.de. Metadaten-ID: 495d1f90-...
# Dieser Call holt EINEN RoadLink (INSPIRE Transport Networks) als GML 3.2.1.
set -euo pipefail

BASE="https://www.geodaten-mv.de/dienste/inspire_tn_atkis_bdlm_download"

echo "== INSPIRE TN MV: GetFeature tn-ro:RoadLink count=1 (GML 3.2.1) =="
curl -sSL --max-time 90 \
  "${BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=tn-ro:RoadLink&COUNT=1" \
  | head -c 2200
echo
echo "Weitere TN-FeatureTypes: tn-ro:Road, tn-ro:ERoad, tn-ro:RoadArea, tn-ra:RailwayLink u.v.m."
