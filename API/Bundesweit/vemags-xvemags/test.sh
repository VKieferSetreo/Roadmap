#!/usr/bin/env bash
# VEMAGS / INS-GST / Xvemags — EINGESCHRÄNKT: kein offener Datenzugang.
# Die einzige technische Tür ist die SOAP/XML-Schnittstelle Xvemags für ZUGELASSENE
# Drittsystem-Hersteller (Antrags-Workflow, KEIN offener Restriktions-Daten-Pull).
# Zugang nur per Hersteller-Zulassung/Vertrag über die Projektleitung (Hessen Mobil).
# Daher KEIN echter Daten-Call möglich — dieser Test prüft nur die Portal-Erreichbarkeit.
# Kontakt/Info: https://www.vemags.de/  ·  https://www.vemags.de/verfahrens-modul/schnittstelle/
set -euo pipefail

echo "== VEMAGS INS-GST-Webservice-Infoseite (Erreichbarkeit) =="
curl -sSL --max-time 30 \
  "https://www.vemags.de/ins-gst-modul/ins-gst-webservice-3/" \
  -o /dev/null -w "HTTP %{http_code}  %{url_effective}\n"
