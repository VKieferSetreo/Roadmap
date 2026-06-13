#!/usr/bin/env bash
# Open-Data SH Straßenbaustellen — offener WFS (dienste.gdi-sh.de), keine Auth.
# WFS 2.0.0 count= funktioniert. Beispiel: eine SH-Baustelle.
# Hinweis: HTML-Portal opendata.sh ist Anubis-geschützt, der WFS aber NICHT.
set -euo pipefail

BASE="https://dienste.gdi-sh.de/WFS_SH_Baustelleninformationen"

echo "== SH Straßenbaustellen (WFS 2.0.0, count=1, GML) =="
curl -sSL --max-time 30 "${BASE}?Service=WFS&Version=2.0.0&Request=GetFeature&typenames=Baustelleninformationen:Baustellen_SH&count=1" | head -c 4000
echo
