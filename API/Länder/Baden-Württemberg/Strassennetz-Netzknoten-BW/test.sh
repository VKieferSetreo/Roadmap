#!/usr/bin/env bash
# Straßennetz/Netzknoten BW — statischer GML-ZIP-Download (kein Live-API).
# Test prüft Erreichbarkeit + ZIP-Magic per Range-Request (2 Bytes, keine 100-MB-Last).
# Offen, keine Registrierung. Lauffähig mit: bash test.sh

UA="Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"
URL="https://mobidata-bw.de/vm/Strassennetz_Netzknoten_BW/GML_Strassennetz_250101.zip"

echo "# HTTP-Status + Content-Type + erste 2 Bytes (PK = gültiges ZIP):"
curl -sSL --max-time 30 -A "$UA" -r 0-1 -o /tmp/strnetz_bw_probe.bin \
  -w "HTTP %{http_code}  type=%{content_type}\n" "$URL"
echo -n "# Magic: "; head -c 2 /tmp/strnetz_bw_probe.bin; echo
echo "# (Vollständigen Download in der Implementierung ohne -r 0-1 ausführen.)"
