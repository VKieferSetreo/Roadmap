#!/usr/bin/env bash
# GovData.de — CKAN Action-API, offen, keine Auth.
# Beispiel: Datensaetze mit Stichwort "Bruecke" im Verkehrs-Filter (groups:tran).
set -euo pipefail

BASE="https://www.govdata.de/ckan/api/3/action"

echo '== package_search q=Bruecke fq=groups:tran (rows=3) =='
curl -sSL --max-time 30 \
  "${BASE}/package_search?q=Br%C3%BCcke&fq=groups:tran&rows=3" \
  | head -c 4000
echo
