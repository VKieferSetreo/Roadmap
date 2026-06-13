#!/usr/bin/env bash
# OpenGeoData Niedersachsen (LGLN) — offen, keine Auth (doorman/noauth).
# Konkret aufgelöst + live: ATKIS-Basis-DLM-WFS der LGLN-OpenData-Plattform.
# Dieser Call holt EINE Straßenachse (klassifiziertes Straßennetz) als GML 3.2.1.
# Hinweis: Auf dem ArcGIS-Hub liegt das "Klassifizierte Straßennetz" nur als WMS
# (kein FeatureServer/GeoJSON-Query); die Vektor-Geometrie kommt aus diesem WFS.
set -euo pipefail

BASE="https://opendata.lgln.niedersachsen.de/doorman/noauth/atkisbdlm_hb_wfs_sf"

echo "== LGLN ATKIS Basis-DLM: GetFeature adv:AX_Strassenachse count=1 (GML 3.2.1) =="
curl -sSL --max-time 90 \
  "${BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=adv:AX_Strassenachse&COUNT=1" \
  | head -c 2200
echo
echo "Weitere FeatureTypes u.a.: adv:AX_Strasse, adv:AX_Fahrbahnachse, adv:AX_BauwerkImVerkehrsbereich (Brücken/Tunnel)"
