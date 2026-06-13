#!/usr/bin/env bash
# DATEX II — europäischer XML-Austauschstandard (KEIN Datenanbieter, sondern Format/Profile).
# Eigentliche DE-Daten kommen über die Mobilithek/Länder-Feeds (siehe ../mobilithek/ und
# Länder-Katalog). Dieser Test prüft nur die Erreichbarkeit der offenen Doku/Schemas —
# der Parser muss DATEX II v2 UND v3 (Profil "German Roadworks") können.
# Doku: https://docs.datex2.eu/  ·  Profile: https://datex2.eu/profiles-directory/
set -euo pipefail

echo "== DATEX II Doku-Portal (Erreichbarkeit) =="
curl -sSL --max-time 30 "https://docs.datex2.eu/" -o /dev/null -w "docs.datex2.eu  HTTP %{http_code}\n"
echo "== DATEX II Profile-Directory (Erreichbarkeit) =="
curl -sSL --max-time 30 "https://datex2.eu/profiles-directory/" -o /dev/null -w "profiles-directory  HTTP %{http_code}\n"
