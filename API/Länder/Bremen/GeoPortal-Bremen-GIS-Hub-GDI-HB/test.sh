#!/usr/bin/env bash
# GeoPortal Bremen / GIS-Hub (GDI-HB) — offen, keine Auth.
# Konkret aufgelöst + live getestet: der offene WMS Straßennetz Land Bremen
# (geodienste.bremen.de/wms_strassennetz) mit Layern Bundesautobahnen,
# Bundesstraßen, Gemeindestraßen, Nullpunkte. GetCapabilities = valider Payload.
# Hinweis: ein offener "Detailnetz Bauwerke"-(Brücken-)WFS existiert in Bremen
# NICHT als Open-Service (Brückeninventar liegt beim ASV Bremen, nicht offen).
set -euo pipefail

WMS="https://geodienste.bremen.de/wms_strassennetz?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities"

echo "== WMS Straßennetz Land Bremen: GetCapabilities (head) =="
curl -sSL --max-time 35 "${WMS}" -w "\n--- HTTP %{http_code} | %{content_type} ---\n" | head -c 2200
echo
echo "Layer u.a.: bundesautobahnen, bundesstrassen, gemeindestrassen, nullpunkte"
