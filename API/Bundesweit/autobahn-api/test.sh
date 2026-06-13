#!/usr/bin/env bash
# Autobahn GmbH API — offen, keine Auth.
# Beispiel: Baustellen (roadworks) der A1 abrufen. Danach Sperrungen (closure) der A1.
# roadId = "A1" (Liste aller roadIds: https://verkehr.autobahn.de/o/autobahn/)
set -euo pipefail

BASE="https://verkehr.autobahn.de/o/autobahn"
ROAD="A1"

echo "== Baustellen (roadworks) ${ROAD} =="
curl -sSL --max-time 30 "${BASE}/${ROAD}/services/roadworks" | head -c 4000
echo
echo "== Sperrungen (closure) ${ROAD} =="
curl -sSL --max-time 30 "${BASE}/${ROAD}/services/closure" | head -c 1500
echo
