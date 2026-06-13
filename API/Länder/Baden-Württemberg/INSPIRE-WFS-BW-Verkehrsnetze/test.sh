#!/usr/bin/env bash
# INSPIRE-WFS BW Verkehrsnetze (ATKIS Basis-DLM), LGL-BW — offen, keine Auth.
# Aufgelöst + live: owsproxy.lgl-bw.de WFS_INSP_BW_Verkehrsnetz_ATKIS_BasisDLM.
# Lizenz laut Live-Capabilities: Open Data, dl-de/by-2-0 (NICHT restriktiv).
# Dieser Call holt EINEN RoadLink (INSPIRE Transport Networks) als GML 3.2.
set -euo pipefail

BASE="https://owsproxy.lgl-bw.de/owsproxy/wfs/WFS_INSP_BW_Verkehrsnetz_ATKIS_BasisDLM"

echo "== INSPIRE BW Verkehrsnetze: GetFeature tn-ro:RoadLink count=1 (GML 3.2) =="
curl -sSL --max-time 90 \
  "${BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=tn-ro:RoadLink&COUNT=1" \
  | head -c 2200
echo
echo "Lizenz (aus Capabilities): Unentgeltliche Nutzung nach Open Data, dl-de/by-2-0."
