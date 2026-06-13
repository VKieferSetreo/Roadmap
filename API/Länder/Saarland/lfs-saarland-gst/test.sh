#!/usr/bin/env bash
# LfS Saarland — GST/Schwertransport (Restriktions-Stelle, KEINE offenen Daten).
# Es gibt keinen maschinellen Endpunkt und keine offene Brückenliste (Lücke Saarland).
# saarland.de blockt automatisierte Abrufe (HTTP 403, WAF) — dieser Call zeigt nur den Status.
# Echte Restriktion via VEMAGS-INS-GST (Bund, restricted) oder LfS-Anfrage.
curl -sSL --max-time 30 -o /dev/null -w "LfS-FAQ-Seite: HTTP %{http_code} (403 = WAF/Bot-Schutz, nur im Browser erreichbar)\n" \
  "https://www.saarland.de/lfs/DE/service/faq/haeufige_Fragen_und_Antworten_node.html"
