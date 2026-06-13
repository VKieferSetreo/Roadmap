#!/usr/bin/env bash
# BASt Brückenkarte / Brückenstatistik — Web-Karten-Anwendung mit Export.
# KEIN bestätigter offener Daten-Endpunkt (Karte hinter via.bund.de, Deep-Link instabil).
# Daher kein echter Daten-Call möglich; dieser Test ruft nur die Doku-/Portalseite ab,
# um Erreichbarkeit zu prüfen. Datenbezug = Export-Funktion in der Web-Karte (manuell).
# Portal: https://www.bmv.de/SharedDocs/DE/Artikel/StB/brueckenkarte.html?nn=12830
set -euo pipefail

echo "== BASt Brückenstatistik-Portalseite (Erreichbarkeit) =="
curl -sSL --max-time 30 \
  "https://www.bast.de/DE/Ingenieurbau/Fachthemen/brueckenstatistik/brueckenstatistik.html" \
  -o /dev/null -w "HTTP %{http_code}  %{url_effective}\n"
