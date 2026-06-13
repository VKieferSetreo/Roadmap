#!/usr/bin/env bash
# BVV / LDBV — ATKIS Basis-DLM (Geobasis Bayern, CC BY 4.0). Offen, keine Auth.
# Konkret aufgelöster offener WFS: geoservices.bayern.de ogc_atkis_basisdlm.cgi.
# Dieser Call holt EINE Straßenachse (klassif. Straßennetz) als GML 3.2.1.
set -euo pipefail

BASE="https://geoservices.bayern.de/wfs/v1/ogc_atkis_basisdlm.cgi"

echo "== BY ATKIS Basis-DLM: GetFeature adv:AX_Strassenachse count=1 (GML 3.2.1) =="
curl -sSL --max-time 90 \
  "${BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=adv:AX_Strassenachse&COUNT=1" \
  | head -c 2200
echo
echo "Weitere FeatureTypes u.a.: adv:AX_Strasse, adv:AX_Fahrbahnachse, adv:AX_Strassenverkehr, adv:AX_BauwerkImVerkehrsbereich"
