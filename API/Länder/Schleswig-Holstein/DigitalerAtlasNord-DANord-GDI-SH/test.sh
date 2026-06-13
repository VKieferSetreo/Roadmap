#!/usr/bin/env bash
# DigitalerAtlasNord (DANord) / GDI-SH — Geo-Viewer (offen, keine Auth).
# Baustellen-Daten = offener WFS WFS_SH_Baustelleninformationen (siehe Nachbar-Ordner).
# Dieser Call prüft die Erreichbarkeit des GDI-SH-Portals.
set -euo pipefail

echo "== GDI-SH / DANord Portal (HTTP-Status) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "https://www.gdi-sh.de/DE/home"
echo
echo "Baustellen-WFS (live): https://dienste.gdi-sh.de/WFS_SH_Baustelleninformationen"
