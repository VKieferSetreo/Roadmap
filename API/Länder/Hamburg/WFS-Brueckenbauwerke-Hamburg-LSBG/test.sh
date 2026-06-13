#!/usr/bin/env bash
# WFS Brücken & Ingenieurbauwerke Hamburg (LSBG) — offen, keine Auth.
# WICHTIG: WFS 2.0.0 count= liefert hier 0 Features → VERSION=1.1.0 + maxFeatures=1 nutzen.
# Beispiel: eine Straßenbrücke abrufen.
set -euo pipefail

BASE="https://geodienste.hamburg.de/HH_WFS_Brueckenbauwerke"

echo "== Straßenbrücken (WFS 1.1.0, maxFeatures=1, GML) =="
curl -sSL --max-time 30 "${BASE}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&typename=de.hh.up:strassenbruecken&maxFeatures=1" | head -c 4000
echo
