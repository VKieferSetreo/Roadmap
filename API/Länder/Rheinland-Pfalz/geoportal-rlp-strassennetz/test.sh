#!/usr/bin/env bash
# GeoPortal.rlp.de — Straßennetz LBM (OGC API Features, GeoJSON)
# Offen, kein Key. Holt 1 Landesstraßen-Feature aus dem OAF-Dienst (collection ms:Landesstrassen).
curl -sSL --max-time 30 \
  "https://www.geoportal.rlp.de/spatial-objects/513/collections/ms:Landesstrassen/items?f=json&limit=1" \
  | head -c 4000
