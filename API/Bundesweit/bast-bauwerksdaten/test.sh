#!/usr/bin/env bash
# SIB-Bauwerke / ASB-ING — EINGESCHRÄNKT: Behörden-/Fachsystem, KEINE offene API.
# Das ist die eigentliche Quelle für Brücken-Traglast + lichte Höhe (Goldstandard), aber
# NICHT offen abrufbar (Datenaustausch nur via TT-SIB/NW-SIB der Länder; Software via
# WPM-Ingenieure). Realistischer Zugang: über VEMAGS INS-GST (siehe ../vemags-xvemags/)
# oder Datenlieferungsvereinbarung mit Landesbetrieben/Autobahn GmbH.
# Kein echter Daten-Call möglich -> dieser Test prüft nur die BASt-Infoseite.
# Info: https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/bauwerksdaten.html
set -euo pipefail

echo "== BASt Bauwerksdaten-Infoseite (Erreichbarkeit) =="
curl -sSL --max-time 30 \
  "https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/bauwerksdaten.html" \
  -o /dev/null -w "HTTP %{http_code}  %{url_effective}\n"
