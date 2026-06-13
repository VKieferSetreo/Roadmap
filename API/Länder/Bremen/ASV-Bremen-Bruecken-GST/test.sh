#!/usr/bin/env bash
# ASV Bremen — kein offener Datendienst. Bauwerks-/GST-Daten per Anfrage.
# Dieser Call prüft nur die Erreichbarkeit der Aufgaben-/Bauwerksseite.
set -euo pipefail

echo "== ASV Bremen Brücken/Ingenieurbau (HTTP-Status) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "https://www.asv.bremen.de/aufgaben/bruecken-und-ingenieurbau-1714"
echo
echo "Hinweis: kein offener WFS — Bauwerks-/GST-Daten bei ASV Bremen Abt. 5 / GST-Stelle anfragen."
