#!/usr/bin/env bash
# OpenGeoData Niedersachsen (LGLN ArcGIS Hub) — offen, keine Auth.
# Hinweis: konkrete FeatureServer-URL je Datensatz erst über den Hub abrufbar (nicht raten).
# Dieser Call prüft die Erreichbarkeit des Hub-Portals.
set -euo pipefail

URL="https://ni-lgln-opengeodata.hub.arcgis.com/"

echo "== OpenGeoData NI Hub (HTTP-Status) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "${URL}"
echo
echo "Nächster Schritt: gewünschten Datensatz im Hub öffnen → Tab 'I want to use this' / 'API' → FeatureServer- bzw. GeoJSON-URL kopieren."
