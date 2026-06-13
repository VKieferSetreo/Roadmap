#!/usr/bin/env bash
# Transparenzportal Bremen — Offene Daten. Offen, keine Auth.
# Such-/Übersichtsseiten liefern HTML; konkrete Datensatz-Downloads über die Suche.
# Dieser Call prüft die Erreichbarkeit der Daten-Übersicht.
set -euo pipefail

echo "== Transparenzportal Bremen — Daten-Suche (HTTP-Status) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "https://www.transparenz.bremen.de/daten-1467"
echo
echo "== Gesamtübersicht offene Daten (HTTP-Status) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "https://www.transparenz.bremen.de/daten/offene-daten-bremen-gesamtuebersicht-aller-offenen-datensaetze-8249"
echo
echo "Nächster Schritt: Verkehr/Brücken-Datensatz in der Suche öffnen → JSON/XML/WFS-Download-URL kopieren."
