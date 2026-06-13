#!/usr/bin/env bash
# Baustellen Hauptverkehrs-/Bundesfernstraßen Hamburg (LSBG) — offen, keine Auth.
# HINWEIS: der frühere Live-WFS HH_WFS_Verkehr_opendata liefert aktuell HTTP 404
# (umbenannt/abgelöst). Dieser Call zieht den verifizierten Archiv-Snapshot (GML, GetData).
# Relevante FeatureType: app:verkehr_baustellen_prod.
# Für aktuelle stadtweite Baustellen siehe ../WFS-Baustellen-Hamburg (🟢 live).
set -euo pipefail

SNAP="https://archiv.transparenz.hamburg.de/hmbtgarchive/HMDK/hh_wfs_verkehr_opendata_26235_snap_5.XML"

echo "== Verkehr-OpenData Archiv-Snapshot (GML, head) =="
curl -sSL --max-time 30 "${SNAP}" | head -c 4000
echo
