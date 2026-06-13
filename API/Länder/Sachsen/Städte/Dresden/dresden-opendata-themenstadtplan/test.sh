#!/usr/bin/env bash
# Dresden — Straßenbaustellen / Verkehrseinschränkungen (Themenstadtplan / Open Data).
# Backend = kommisdd.dresden.de OGC API Features (WFS3, cardoGIS). Offen, keine Auth.
# L60  = aktuelle Verkehrseinschränkungen (Baustellen/Sperrungen, LineString, EPSG:4326)
# L150 = zukünftige Verkehrseinschränkungen
set -euo pipefail

URL="https://kommisdd.dresden.de/net4/public/ogcapi/collections/L60/items?limit=2&f=json"

echo "== Dresden aktuelle Verkehrseinschränkungen (kommisdd OGC API, L60, limit=2) =="
curl -sSL --max-time 40 -A "Mozilla/5.0 (compatible)" "${URL}" | head -c 4000
echo
