#!/usr/bin/env bash
# INSPIRE-WFS BW Verkehrsnetze (LGL) — Metadatensatz-Probe.
# HINWEIS: Kein direkter OGC-Endpunkt aufgelöst; Lizenz RESTRIKTIV (VwVNutzHeo),
# vor Nutzung mit LGL-BW klären (siehe abdeckung.txt, STATUS: zu-bestätigen).
# Dieser Test prüft nur die Erreichbarkeit des Metadatensatzes. Kein erfundener Endpunkt.
# Lauffähig mit: bash test.sh

UA="Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
URL="https://metadaten.geoportal-bw.de/geonetwork/srv/api/records/53cfcf0b-8dae-9c07-e97a-2ff9ed7af6d1"

curl -sSL --max-time 30 -A "$UA" -o /dev/null \
  -w "HTTP %{http_code}  type=%{content_type}\n" "$URL"
echo "# GetCapabilities-URL über GDI-BW-Katalog auflösen + Nutzungsrechte mit LGL-BW klären."
