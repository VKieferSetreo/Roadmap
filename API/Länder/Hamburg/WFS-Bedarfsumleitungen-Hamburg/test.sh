#!/usr/bin/env bash
# WFS Bedarfsumleitungen Hamburg — offen, keine Auth.
# FeatureType app:bedarfsumleitungen (Prefix app:, nicht de.hh.up:).
# WFS 2.0.0 count= unzuverlässig → VERSION=1.1.0 + maxFeatures=1.
set -euo pipefail

BASE="https://geodienste.hamburg.de/HH_WFS_Bedarfsumleitungen"

echo "== Bedarfsumleitungen Hamburg (WFS 1.1.0, maxFeatures=1, GML) =="
curl -sSL --max-time 30 "${BASE}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&typename=app:bedarfsumleitungen&maxFeatures=1" | head -c 4000
echo
