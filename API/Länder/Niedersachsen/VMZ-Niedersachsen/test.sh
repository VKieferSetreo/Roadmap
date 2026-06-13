#!/usr/bin/env bash
# VMZ Niedersachsen — nur Web-Portal, KEINE maschinenlesbare API/DATEX öffentlich.
# Dieser Call prüft nur die Erreichbarkeit der Portal-Startseite.
# Strukturierter Feed: bei VMZ Niedersachsen anfragen (+49 511 35354-232).
set -euo pipefail

URL="https://www.vmz-niedersachsen.de/"

echo "== VMZ Niedersachsen Portal (HTTP-Status) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "${URL}"
echo
echo "Hinweis: kein offener Datendienst — Feed/DATEX bei VMZ NI erfragen."
