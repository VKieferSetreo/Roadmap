#!/usr/bin/env bash
# OpenGeodata.NRW / Straßen.NRW — WFS Bauwerke (Brücken/Tunnel)
# Offener WFS, kein Key. Holt 1 Bauwerk (Brücke) aus dem FeatureType ms:Bauwerke.
curl -sSL --max-time 30 \
  "https://www.wfs.nrw.de/wfs/strassen_nrw?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:Bauwerke&COUNT=1" \
  | head -c 4000
