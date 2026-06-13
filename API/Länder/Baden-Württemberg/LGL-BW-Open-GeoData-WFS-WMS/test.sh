#!/usr/bin/env bash
# LGL-BW Open GeoData / GDI-BW — offener ATKIS-Basis-DLM-WFS (NOrA-Schema).
# Aufgelöst + live: owsproxy.lgl-bw.de WFS_LGL-BW_ATKIS_Basis-DLM. Open Data,
# dl-de/by-2-0. Dieser Call holt EINE Verkehrslinie (Straßennetz) als GML 3.2.
set -euo pipefail

BASE="https://owsproxy.lgl-bw.de/owsproxy/wfs/WFS_LGL-BW_ATKIS_Basis-DLM"

echo "== LGL-BW ATKIS Basis-DLM: GetFeature nora:v_verkehrslinie count=1 (GML 3.2) =="
curl -sSL --max-time 90 \
  "${BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=nora:v_verkehrslinie&COUNT=1" \
  | head -c 2200
echo
echo "Weitere FeatureTypes u.a.: nora:v_verkehrsflaeche, nora:v_verkehrspunkt, nora:v_bauwerkslinie/-punkt/-flaeche (Brücken/Bauwerke)"
