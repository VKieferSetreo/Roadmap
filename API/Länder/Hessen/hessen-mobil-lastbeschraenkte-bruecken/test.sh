#!/usr/bin/env bash
# Hessen Mobil — Lastbeschränkte Brücken (PDF-Liste)
# Offen, kein Key. Lädt die offizielle PDF-Liste und zeigt Header/Größe (binär → kein Text-Dump).
curl -sSL --max-time 30 -D - -o /tmp/he_bruecken.pdf \
  "https://mobil.hessen.de/sites/mobil.hessen.de/files/2026-02/lastbeschraenkte_bruecken_in_hessen_stand_2026-02-27_0.pdf" \
  | head -c 4000
echo "--- gespeichert: /tmp/he_bruecken.pdf ($(wc -c < /tmp/he_bruecken.pdf) bytes) — Liste maschinell nur via PDF-Parsing ---"
