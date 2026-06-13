#!/usr/bin/env bash
# Baustellen Hauptverkehrs-/Bundesfernstraßen Hamburg (LSBG).
# STATUS: ABGELÖST. Der dedizierte Verkehr-WFS HH_WFS_Verkehr_opendata ist
# abgeschaltet (HTTP 404). Stadtweite Baustellen (inkl. Haupt-/Bundesfernnetz)
# laufen über den GRÜNEN Dienst hh_wfs_baustellen (../WFS-Baustellen-Hamburg).
# Dieser Test belegt (1) den 404 des alten Diensts und (2) HTTP 200 des Nachfolgers.
set -euo pipefail

OLD="https://geodienste.hamburg.de/HH_WFS_Verkehr_opendata?SERVICE=WFS&REQUEST=GetCapabilities"
NEW="https://geodienste.hamburg.de/hh_wfs_baustellen?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetCapabilities"

echo "== Alter Verkehr-WFS (abgelöst, erwartet 404) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "${OLD}"
echo
echo "== Nachfolger hh_wfs_baustellen (grün, erwartet 200) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "${NEW}"
echo
echo "Bezug: ../WFS-Baustellen-Hamburg (FeatureType de.hh.up:baustelle)"
