#!/usr/bin/env bash
# GST-Routen Hamburg (Großraum- und Schwertransport-Netz) — offen, keine Auth. ⭐
# Sauberster Weg: OGC API Features → GeoJSON. limit=1 für ein Beispiel-Feature.
# (WFS 2.0.0 count= ist auf der deegree-Instanz unzuverlässig; OGC-API liefert verlässlich.)
set -euo pipefail

OGC="https://api.hamburg.de/datasets/v1/grossraum_und_schwertransport_routen"

echo "== OGC API Features — GST-Netz GeoJSON (limit=1) =="
curl -sSL --max-time 30 "${OGC}/collections/grossraum_schwertransport_netz/items?f=json&limit=1" | head -c 4000
echo
echo "== Alternativ WFS 1.1.0 GetFeature (maxFeatures=1, GML) =="
curl -sSL --max-time 30 "https://geodienste.hamburg.de/HH_WFS_Grossraum_und_Schwertransport_Routen?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&typename=de.hh.up:grossraum_schwertransport_netz&maxFeatures=1" | head -c 1500
echo
