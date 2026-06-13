#!/usr/bin/env bash
# Umleitungsstrecken Schleswig-Holstein — offener WFS (dienste.gdi-sh.de), keine Auth.
# Selber Dienst wie SH-Baustellen, FeatureType Umleitungsstrecken. WFS 2.0.0 count= ok.
set -euo pipefail

BASE="https://dienste.gdi-sh.de/WFS_SH_Baustelleninformationen"

echo "== SH Umleitungsstrecken (WFS 2.0.0, count=1, GML) =="
curl -sSL --max-time 30 "${BASE}?Service=WFS&Version=2.0.0&Request=GetFeature&typenames=Baustelleninformationen:Umleitungsstrecken&count=1" | head -c 4000
echo
