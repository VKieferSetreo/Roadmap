#!/usr/bin/env bash
# Berlin VIZ GeoJSON-Feeds — offen, keine Auth.
# Beispiel: Landesmeldestelle (TIC3) GeoJSON-Feed abrufen.
set -euo pipefail

curl -sSL --max-time 30 \
  "https://api.viz.berlin.de/tic3/baustellen_sperrungen_tic.json" \
  | head -c 4000
echo
