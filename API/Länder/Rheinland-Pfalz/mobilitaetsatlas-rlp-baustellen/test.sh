#!/usr/bin/env bash
# Mobilitätsatlas RLP / BaustellenInfo digital — nur Web-Portal (kein offener Feed).
# Es existiert KEIN maschinenlesbarer Endpunkt (geprüft: /api /data /geojson /wfs → 404).
# Dieser Call ruft nur die Portalseite ab (HTML), um Erreichbarkeit zu zeigen.
# Realer Datenbezug: Mobilithek bzw. LBM-DATEX-II-Knoten (siehe ../lbm-rlp-datex2-knoten).
curl -sSL --max-time 30 \
  "https://baustelleninfo.rlp.de/" \
  | head -c 4000
