#!/usr/bin/env bash
# BayernInfo / ArbIS → Mobilithek — Baustellen (DATEX II).
# LÄUFT ERST MIT MOBILITHEK-ACCOUNT + DATENNUTZUNGSVERTRAG (siehe abdeckung.txt / .env).
# Ohne gefüllte .env wird hier nur das öffentliche Mobilithek-Angebot geprüft.
# Lauffähig mit: bash test.sh

UA="Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"

# .env laden, falls vorhanden:
ENV_FILE="$(dirname "$0")/bayerninfo-baustellen.env"
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

if [ -n "$BAYERNINFO_BAUSTELLEN_DATA_URL" ] && [ -n "$BAYERNINFO_BAUSTELLEN_CERT" ]; then
  echo "# Authentifizierter DATEX-II-Abruf (Client-Zertifikat):"
  curl -sSL --max-time 30 -A "$UA" \
    --cert "$BAYERNINFO_BAUSTELLEN_CERT" --key "$BAYERNINFO_BAUSTELLEN_KEY" \
    "$BAYERNINFO_BAUSTELLEN_DATA_URL" | head -c 4000
  echo
else
  echo "# Kein Account/Zertifikat in .env hinterlegt — prüfe nur das öffentliche Mobilithek-Angebot:"
  curl -sSL --max-time 30 -A "$UA" -o /dev/null \
    -w "HTTP %{http_code}  type=%{content_type}\n" \
    "https://mobilithek.info/offers/110000000002507001"
  echo "# → Account anlegen: https://mobilithek.info/  (Angebot 110000000002507001)"
fi
