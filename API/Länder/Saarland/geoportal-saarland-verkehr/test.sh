#!/usr/bin/env bash
# GeoPortal Saarland (GDI-SL) — Verkehr_WFS (ArcGIS MapServer WFSServer)
# Offen, kein Key. Holt 1 Strassennetz-Feature aus dem FeatureType Verkehr_WFS:Strassennetz.
curl -sSL --max-time 30 \
  "https://geoportal.saarland.de/arcgis/services/Internet/Verkehr_WFS/MapServer/WFSServer?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=Verkehr_WFS:Strassennetz&COUNT=1" \
  | head -c 4000
