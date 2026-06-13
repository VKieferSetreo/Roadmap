#!/usr/bin/env bash
# GST-Schwertransportkarte NRW — lastbeschränkte Brücken (ArcGIS REST FeatureServer)
# Offen, kein Key. Holt 1 lastbeschränkte Brücke mit allen Attributen.
curl -sSL --max-time 30 \
  "https://www.arcgishostedserver.nrw.de/arcgis/rest/services/Hosted/last_bruecken1/FeatureServer/0/query?where=1%3D1&outFields=*&resultRecordCount=1&f=json" \
  | head -c 4000
