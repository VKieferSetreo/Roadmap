#!/usr/bin/env bash
# Sachsen GST-Negativkarte — offen, keine Auth. Daten sind PDF je Landkreis (~19–44 MB).
# Beispiel: HTTP-Header eines echten Negativkarte-PDF (Bautzen, 48t) — beweist Erreichbarkeit/Typ/Größe
# ohne die 30 MB-Datei vollständig zu ziehen.
set -euo pipefail

PDF="https://www.lasuv.sachsen.de/download/Negativkarte_Bautzen_48t_Stand_16_10_2025.pdf"

echo "== HEAD ${PDF} =="
curl -sSL --max-time 30 -I "${PDF}" | head -c 4000
echo
