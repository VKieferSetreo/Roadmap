#!/usr/bin/env bash
# Mobilithek (NAP DE) — GATED: läuft erst mit Account + Client-Zertifikat (mTLS).
# Kein offener globaler Endpunkt — pro abonniertem Datensatz eine eigene Broker-Feed-URL.
# Vorgehen: Konto auf https://mobilithek.info/ -> Datensatz abonnieren -> Zertifikat ->
# Feed-URL + Zertifikat in mobilithek.env eintragen, dann diesen Test ausführen.
set -euo pipefail

ENV_FILE="$(dirname "$0")/mobilithek.env"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

if [ -z "${MOBILITHEK_FEED_URL:-}" ] || [ -z "${MOBILITHEK_CERT:-}" ]; then
  echo "Kein Feed/Zertifikat gesetzt — Account anlegen: https://mobilithek.info/ (siehe mobilithek.env)"
  echo "Beispielaufruf (DATEX II Pull mit Client-Zertifikat):"
  echo '  curl -sSL --max-time 30 --cert "$MOBILITHEK_CERT" --key "$MOBILITHEK_CERT_KEY" "$MOBILITHEK_FEED_URL" | head -c 4000'
  exit 0
fi

echo "== Mobilithek DATEX-II Feed (mTLS) =="
curl -sSL --max-time 30 \
  --cert "${MOBILITHEK_CERT}" --key "${MOBILITHEK_CERT_KEY}" \
  "${MOBILITHEK_FEED_URL}" | head -c 4000
echo
