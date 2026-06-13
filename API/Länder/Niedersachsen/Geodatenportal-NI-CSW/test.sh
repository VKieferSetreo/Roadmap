#!/usr/bin/env bash
# Geodatensuche Niedersachsen (CSW-Katalog GDI-NI) — offen, keine Auth.
# STATUS 2026-06-13: serverseitiger 503 (Wartung) auf dem gesamten Host,
# unabhängig vom Pfad. Dieser Test prüft den kanonischen CSW-GetCapabilities
# und die Such-UI; bei Wiedererreichbarkeit liefert GetCapabilities CSW 2.0.2.
set -euo pipefail

CSW="https://geoportal.geodaten.niedersachsen.de/harvest/srv/de/csw?SERVICE=CSW&VERSION=2.0.2&REQUEST=GetCapabilities"
UI="https://geoportal.geodaten.niedersachsen.de/harvest/srv/search?keyword=Verkehr"

echo "== CSW GetCapabilities (kanonisch) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "${CSW}"
echo
echo "== Such-UI keyword=Verkehr =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "${UI}"
echo
echo "Hinweis: HTTP 503 = Dienst-Wartung (nicht Pfad-Fehler). Solange down → NI-Dienst-Suche"
echo "über ArcGIS-Hub / LGLN-OpenData-WFS / NUMIS (siehe abdeckung.txt)."
