#!/usr/bin/env bash
# NWSIB-online — läuft erst mit Account/Login (kein offener Datendienst).
# Dieser Call prüft nur die Erreichbarkeit der Login-Startseite.
set -euo pipefail

# Zugangsdaten (wenn vorhanden) laden:
[ -f "$(dirname "$0")/nwsib-online.env" ] && set -a && . "$(dirname "$0")/nwsib-online.env" && set +a

URL="https://www.nwsib-niedersachsen.de/"

echo "== NWSIB-online Startseite (HTTP-Status) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "${URL}"
echo
echo "Hinweis: Datenzugang Login-gated — Datenexport/Schnittstelle bei NLStBV anfragen."
