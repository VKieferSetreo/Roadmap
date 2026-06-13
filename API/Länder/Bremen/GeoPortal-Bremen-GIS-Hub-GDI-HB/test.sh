#!/usr/bin/env bash
# GeoPortal Bremen / GIS-Hub (GDI-HB) — offen, keine Auth.
# Konkrete WFS-Endpunkte je Layer erst über das Portal/MetaVer auflösen (nicht raten).
# Dieser Call prüft Erreichbarkeit von GeoPortal + GIS-Hub.
set -euo pipefail

echo "== GeoPortal Bremen (HTTP-Status) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "https://geoportal.bremen.de/geoportal/"
echo
echo "== GIS-Hub Bremen (HTTP-Status) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "https://gis-hub.bremen.de/portal/home/index.html"
echo
echo "Nächster Schritt: Layer 'Detailnetz Bauwerke' im GeoPortal/MetaVer öffnen → WFS-URL kopieren."
