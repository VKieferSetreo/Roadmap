#!/usr/bin/env bash
# NRW.Mobidrom / mobilitaetsdaten.nrw — Open-Data-CKAN-Katalog (Facade)
# Offen, kein Key. Listet die verfügbaren Datensätze (mit DATEX-II/GTFS-Resource-URLs).
curl -sSL --max-time 30 \
  "https://www.mobilitaetsdaten.nrw/api/open-data-ckan-facade/ckan/dataset" \
  | head -c 4000
