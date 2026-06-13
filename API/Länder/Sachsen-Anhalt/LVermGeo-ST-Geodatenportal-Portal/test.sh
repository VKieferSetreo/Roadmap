#!/usr/bin/env bash
# Geodatenportal Sachsen-Anhalt (LVermGeo) — Open-Data-Rubrik, offen, keine Auth.
# Aufgelöst + live: INSPIRE-WFS ST Verkehrsnetze ATKIS Basis-DLM.
# Dieser Call holt EINEN RoadLink (INSPIRE Transport Networks) als GML 3.2.1.
set -euo pipefail

BASE="https://geodatenportal.sachsen-anhalt.de/ows_INSPIRE_LVermGeo_ATKIS_TN_WFS"

echo "== INSPIRE TN ST: GetFeature tn-ro:RoadLink count=1 (GML 3.2.1) =="
curl -sSL --max-time 90 \
  "${BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=tn-ro:RoadLink&COUNT=1" \
  | head -c 2200
echo
echo "Weitere TN-FeatureTypes: tn-ro:Road, tn-ro:RoadArea, tn-ro:RoadServiceArea, tn-ra:RailwayLink u.v.m."
