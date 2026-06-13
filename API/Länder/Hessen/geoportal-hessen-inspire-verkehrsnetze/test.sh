#!/usr/bin/env bash
# Geoportal Hessen / GDI-HE — INSPIRE Verkehrsnetze (OGC API Features, GeoJSON)
# Offen, kein Key. Holt 1 Straßenabschnitt (tn-ro:RoadLink) aus dem ATKIS-Basis-DLM-Dienst.
curl -sSL --max-time 30 \
  "https://www.geoportal.hessen.de/spatial-objects/723/collections/tn-ro:RoadLink/items?f=json&limit=1" \
  | head -c 4000
