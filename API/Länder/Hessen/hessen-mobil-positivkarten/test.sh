#!/usr/bin/env bash
# Hessen Mobil — Positivkarten GST (PDF je Landkreis × Gewichtsklasse)
# Offen, kein Key. Lädt eine Beispiel-Positivkarte (Darmstadt, 72 t) und zeigt Header/Größe.
curl -sSL --max-time 30 -D - -o /tmp/he_positivkarte.pdf \
  "https://mobil.hessen.de/sites/mobil.hessen.de/files/2023-03/darmstadt_72t.pdf" \
  | head -c 4000
echo "--- gespeichert: /tmp/he_positivkarte.pdf ($(wc -c < /tmp/he_positivkarte.pdf) bytes) — Karte ist PDF (bildhaft) ---"
