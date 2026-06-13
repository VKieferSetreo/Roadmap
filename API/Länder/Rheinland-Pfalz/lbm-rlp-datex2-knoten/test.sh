#!/usr/bin/env bash
# LBM RLP — DATEX-II-Knoten.
# LÄUFT ERST MIT ACCOUNT: der DATEX-II-Feed liegt hinter der Mobilithek (Konto nötig).
# Es gibt keinen offenen Endpunkt (datex2.eu nodes_directory ist 404).
# Nach Mobilithek-Anmeldung die Feed-URL/Creds in lbm-rlp-datex2.env eintragen.
set -a; [ -f "$(dirname "$0")/lbm-rlp-datex2.env" ] && . "$(dirname "$0")/lbm-rlp-datex2.env"; set +a
if [ -z "$LBM_RLP_DATEX_FEED_URL" ]; then
  echo "Kein LBM_RLP_DATEX_FEED_URL gesetzt — zuerst Mobilithek-Konto holen (siehe .env)."
  echo "Fallback: zeige Erreichbarkeit der LBM-Infoseite:"
  curl -sSL --max-time 30 "https://lbm.rlp.de/themen/verkehrssteuerung/mobilitaetsatlas" | head -c 2000
  exit 0
fi
curl -sSL --max-time 30 -u "$LBM_RLP_DATEX_USER:$LBM_RLP_DATEX_PASS" "$LBM_RLP_DATEX_FEED_URL" | head -c 4000
