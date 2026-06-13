#!/usr/bin/env bash
# Mobilithek NI-DATEX — läuft erst mit Account + abonniertem Datenpaket.
# Dieser Call prüft nur die Erreichbarkeit der Plattform.
set -euo pipefail

[ -f "$(dirname "$0")/mobilithek-ni.env" ] && set -a && . "$(dirname "$0")/mobilithek-ni.env" && set +a

if [ -n "${MOBILITHEK_NI_DATENPAKET_URL:-}" ]; then
  echo "== NI-DATEX-Datenpaket abrufen =="
  curl -sSL --max-time 30 "${MOBILITHEK_NI_DATENPAKET_URL}" | head -c 4000
else
  echo "== Mobilithek-Plattform (HTTP-Status) =="
  curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "https://mobilithek.info/"
  echo "Hinweis: MOBILITHEK_NI_DATENPAKET_URL in mobilithek-ni.env setzen (nach Registrierung)."
fi
echo
