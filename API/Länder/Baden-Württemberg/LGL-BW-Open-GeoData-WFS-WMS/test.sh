#!/usr/bin/env bash
# LGL-BW Open GeoData / GDI-BW — Geobasis-Dienste.
# HINWEIS: Der konkrete WFS/WMS-GetCapabilities-Endpunkt ist NICHT öffentlich aufgelöst
# (siehe abdeckung.txt, STATUS: zu-bestätigen). Kein erfundener Endpunkt.
# Dieser Test prüft das Open-GeoData-Portal (Einstiegspunkt für die Dienst-Auflösung).
# Lauffähig mit: bash test.sh

UA="Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
URL="https://opengeodata.lgl-bw.de/"

curl -sSL --max-time 30 -A "$UA" -o /dev/null \
  -w "HTTP %{http_code}  type=%{content_type}\n" "$URL"
echo "# Dienst-URLs über GDI-BW-Katalog auflösen: https://metadaten.geoportal-bw.de/"
