#!/usr/bin/env bash
# GDI-SH Geoportal / OpenGBD (LVermGeo SH) — offen, keine Auth.
# HTML-Portal ist Anubis-geschützt; CKAN-API-Pfad /api/3/action/ ist es NICHT.
# Beispiel: Datensätze mit WFS-Resource enumerieren (rows=1).
set -euo pipefail

BASE="https://opendata.schleswig-holstein.de/api/3/action/package_search"

echo "== OpenData SH CKAN package_search: q=wfs (rows=1) =="
curl -sSL --max-time 30 "${BASE}?q=wfs&rows=1" | head -c 4000
echo
echo "Nächster Schritt: gewünschten Datensatz auswählen → resources[].url (WFS/WMS) übernehmen."
