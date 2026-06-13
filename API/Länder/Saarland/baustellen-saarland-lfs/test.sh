#!/usr/bin/env bash
# baustellen.saarland (LfS) — offener GeoJSON-Baustellen-Feed
# Offen, kein Key. Holt den Punkt-Baustellen-Feed (Sperrungen via roadclosed-Flag).
# Weitere Feeds: roadworks_line_geojson.geojson, verkehrsmeldungen/traffic_messages_{point,line}_geojson.geojson
curl -sSL --max-time 30 \
  "https://baustellen.saarland/data/baustellen/roadworks_point_geojson.geojson" \
  | head -c 4000
