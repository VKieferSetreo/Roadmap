#!/usr/bin/env bash
# LBM RLP — Brücken & Schwertransporte (Restriktions-Stelle, KEINE offenen Daten).
# Es gibt keinen maschinellen Endpunkt und keine offene Brückenliste (Lücke RLP).
# Dieser Call ruft nur die Brücken-Themenseite ab (HTML), um Erreichbarkeit zu zeigen.
# Echte Restriktion via VEMAGS-INS-GST (Bund, restricted) oder LBM-Anfrage.
curl -sSL --max-time 30 \
  "https://lbm.rlp.de/themen/bruecken" \
  | head -c 4000
