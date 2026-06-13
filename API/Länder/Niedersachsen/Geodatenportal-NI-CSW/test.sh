#!/usr/bin/env bash
# Geodatensuche Niedersachsen (CSW-Katalog GDI-NI) — offen, keine Auth.
# Beispiel: Katalogsuche nach Stichwort "Verkehr".
set -euo pipefail

BASE="https://geoportal.geodaten.niedersachsen.de/harvest/srv/search"

echo "== Geodatensuche NI: keyword=Verkehr =="
curl -sSL --max-time 30 "${BASE}?keyword=Verkehr" | head -c 4000
echo
