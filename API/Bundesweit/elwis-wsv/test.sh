#!/usr/bin/env bash
# ELWIS / GDWS (WSV) — Brückendurchfahrtshöhen über Bundeswasserstraßen.
# Nur statische PDF-Dokumente pro Wasserstraße/Region — KEINE API/CSV.
# Für Straßen-GST nur Spezialfall (Brücke ÜBER Wasserstraße; Straßen-Traglast kommt aus
# SIB-Bauwerke, nicht ELWIS). Kein maschineller Daten-Call -> Test prüft Portal-Erreichbarkeit.
# Daten: https://www.elwis.de/DE/Service/Daten-und-Fakten/Technische-Daten/Technische-Daten-node.html
set -euo pipefail

echo "== ELWIS Technische Daten (Brückendurchfahrtshöhen) — Erreichbarkeit =="
curl -sSL --max-time 30 \
  "https://www.elwis.de/DE/Service/Daten-und-Fakten/Technische-Daten/Technische-Daten-node.html" \
  -o /dev/null -w "HTTP %{http_code}  %{url_effective}\n"
