#!/usr/bin/env bash
# MV Klassifiziertes Straßennetz WFS (verkehrsnetz_lsbv_wfs) — offen, keine Auth.
# Beispiel: 1 Feature des ersten FeatureTypes (siehe GetCapabilities/doku.xml).
set -euo pipefail

BASE="https://www.geodaten-mv.de/dienste/verkehrsnetz_lsbv_wfs"

# typeNames laut GetCapabilities: sbv:Landesstrassen, sbv:Bundesstrassen, sbv:Bundesautobahnen, sbv:Europastrassen, sbv:Netzknoten
curl -sSL --max-time 30 \
  "${BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=sbv:Bundesstrassen&count=1" \
  | head -c 4000
echo
