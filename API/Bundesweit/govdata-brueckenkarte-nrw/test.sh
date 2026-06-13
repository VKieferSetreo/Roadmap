#!/usr/bin/env bash
# GovData / open.NRW — "Lastbeschränkte Brücken NRW (Schwertransportkarte)".
# Der Datensatz selbst ist eine ArcGIS-Web-Karte (giscloud.nrw.de) OHNE bestätigten offenen
# WFS/Download (Rohdaten lt. Datensatz "in Prüfung", per Kontakt anfragbar). Was OFFEN und
# maschinell abrufbar ist: der open.NRW-/GovData-CKAN-Katalog als Sucheinstieg (Bund-Hub).
# Dieser Test ruft real die open.NRW-CKAN-API ab und findet den Schwertransport-Datensatz.
set -euo pipefail

CKAN="https://www.open.nrw/api/3/action/package_search"

echo "== open.NRW CKAN: Schwertransportkarte/lastbeschränkte Brücken (gekürzt) =="
curl -sSL --max-time 30 \
  "${CKAN}?q=lastbeschr%C3%A4nkte+br%C3%BCcken+schwertransport&rows=2" \
  | head -c 4000
echo
