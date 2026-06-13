#!/usr/bin/env bash
# GST.Autobahn (Autobahn GmbH) — EINGESCHRÄNKT: behördeninternes Tool, KEIN offener Datenzugang.
# Liefert im Anhörungsverfahren eine Stellungnahme zur BAB-Streckenpassierbarkeit; kein
# Daten-Export/Feed bekannt. Nur Kontext. Kein echter Daten-Call möglich -> Portal-Check.
# Info: https://www.autobahn.de/fuer-unternehmen/allgemeines
set -euo pipefail

echo "== Autobahn GmbH Unternehmen-Infoseite (Erreichbarkeit) =="
curl -sSL --max-time 30 \
  "https://www.autobahn.de/fuer-unternehmen/allgemeines" \
  -o /dev/null -w "HTTP %{http_code}  %{url_effective}\n"
