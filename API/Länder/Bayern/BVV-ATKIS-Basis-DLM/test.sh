#!/usr/bin/env bash
# BVV / LDBV — ATKIS Basis-DLM (Geobasis Bayern, CC BY 4.0).
# HINWEIS: Konkreter WFS/Download-Endpunkt NICHT öffentlich aufgelöst
# (siehe abdeckung.txt, STATUS: zu-bestätigen). Kein erfundener Endpunkt.
# Test prüft die ATKIS-OpenData-Detailseite (dokumentierter Einstiegspunkt).
# Lauffähig mit: bash test.sh

UA="Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
URL="https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=atkis_basis_dlm"

curl -sSL --max-time 30 -A "$UA" -o /dev/null \
  -w "HTTP %{http_code}  type=%{content_type}\n" "$URL"
echo "# Dienst-URLs: https://www.ldbv.bayern.de/produkte/dienste/geodatendienste.html"
