#!/usr/bin/env bash
# WFS SH Straßeninfo (LBV.SH via GDI-SH) — offen, keine Auth. ⭐
# WFS 2.0.0 count= funktioniert hier. Beispiel: ein Straßennetz-Feature.
set -euo pipefail

BASE="https://service.gdi-sh.de/WFS_SH_Strasseninfo"

echo "== SH Straßennetz (WFS 2.0.0, count=1, GML) =="
curl -sSL --max-time 30 "${BASE}?Service=WFS&Version=2.0.0&Request=GetFeature&typenames=Strasseninfo:Strassennetz&count=1" | head -c 4000
echo
