#!/usr/bin/env bash
# WFS Straßen- und Wegenetz Hamburg (HH-SIB) — offen, keine Auth.
# Expliziter typename nötig (ohne → Exception). WFS 2.0.0 count= unzuverlässig → 1.1.0 + maxFeatures.
# Beispiel: ein BAB-Ast (Knoten-Kanten-Modell).
set -euo pipefail

BASE="https://geodienste.hamburg.de/HH_WFS_Strassen_und_Wegenetz"

echo "== BAB-Ast Hamburg (WFS 1.1.0, maxFeatures=1, GML) =="
curl -sSL --max-time 30 "${BASE}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&typename=de.hh.up:bab_ast&maxFeatures=1" | head -c 4000
echo
