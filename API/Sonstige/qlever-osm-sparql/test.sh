#!/usr/bin/env bash
# QLever OSM-planet SPARQL-Endpoint — offen, keine Auth.
# Beispiel: kleinste moegliche Probe-Query (1 Triple), um den Endpoint live zu beweisen.
# Fuer echte GST-Analysen GeoSPARQL nutzen (ogc:sfContains/sfIntersects auf osmkey:maxheight etc.).
set -euo pipefail

ENDPOINT="https://qlever.cs.uni-freiburg.de/api/osm-planet"

echo "== SPARQL: SELECT * WHERE { ?s ?p ?o } LIMIT 1 =="
curl -sSL --max-time 30 \
  -H "Accept: application/sparql-results+json" \
  -H "Content-Type: application/sparql-query" \
  --data 'SELECT * WHERE { ?s ?p ?o } LIMIT 1' \
  "${ENDPOINT}" \
  | head -c 4000
echo
