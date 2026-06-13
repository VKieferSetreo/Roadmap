#!/usr/bin/env bash
# OSM Planet + Diffs — offen, keine Auth. Voll-Dump ist ~80 GB, daher hier nur das
# winzige minute/state.txt der Replikation: beweist den Live-Diff-Feed (sequenceNumber +
# timestamp), ohne grosse Daten zu ziehen. Echte Diffs: /replication/minute/{NNN}/{NNN}/{NNN}.osc.gz
set -euo pipefail

BASE="https://planet.openstreetmap.org"

echo "== minute-Replikation state.txt (Live-Diff-Feed-Beweis) =="
curl -sSL --max-time 30 "${BASE}/replication/minute/state.txt" | head -c 4000
echo
