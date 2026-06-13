#!/usr/bin/env bash
# Baustellen Hamburg (stadtweit) — offen, keine Auth.
# Casing beachten: hh_wfs_baustellen ist lowercase.
# WFS 2.0.0 count= unzuverlässig → VERSION=1.1.0 + maxFeatures=1.
set -euo pipefail

BASE="https://geodienste.hamburg.de/hh_wfs_baustellen"

echo "== Baustellen Hamburg (WFS 1.1.0, maxFeatures=1, GML) =="
curl -sSL --max-time 30 "${BASE}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&typename=de.hh.up:baustelle&maxFeatures=1" | head -c 4000
echo
