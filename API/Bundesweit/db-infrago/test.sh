#!/usr/bin/env bash
# DB InfraGO — Schienennetz (INSPIRE tn-ra) — offener OGC-WFS (DB GeoViewer GeoServer), keine Auth.
# Beispiel: 1 RailwayNode (Netzknoten Schiene). Bahnübergänge sind hier NICHT als eigener
# Layer geführt -> als GST-Hindernis Bahnübergänge primär aus OSM (railway=level_crossing).
set -euo pipefail

WFS="https://geoviewer.deutschebahn.com/geoviewer-geoserver/tn-ra/ows"

echo "== DB Schienennetz RailwayNode (WFS, 1 Feature) =="
curl -sSL --max-time 30 \
  "${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=tn-ra:RailwayNode&count=1" \
  | head -c 4000
echo
