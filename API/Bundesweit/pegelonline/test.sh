#!/usr/bin/env bash
# PEGELONLINE (WSV) — offene REST-API, keine Auth.
# Beispiel: erste Pegelstation abrufen (Liste gekürzt auf 1 via Ausgabe-Trim).
set -euo pipefail

BASE="https://www.pegelonline.wsv.de/webservices/rest-api/v2"

echo "== Stationen (stations.json, gekürzt) =="
curl -sSL --max-time 30 "${BASE}/stations.json" | head -c 4000
echo
