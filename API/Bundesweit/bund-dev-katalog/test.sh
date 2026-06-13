#!/usr/bin/env bash
# bund.dev / bundesAPI "deutschland" — META-Quelle: kuratierter Katalog von >30 Bundes-APIs
# als OpenAPI-3-Specs (Autobahn, DWD, PEGELONLINE, NINA u.a.). Kein eigener Datenlieferant.
# Dieser Test holt real eine im Katalog gelistete OpenAPI-Spec (Autobahn) als Beleg, dass
# die kuratierten Specs direkt nutzbar sind.
# Katalog: https://bund.dev/apis  ·  Org: https://github.com/bundesAPI
set -euo pipefail

echo "== Beispiel-Spec aus dem Katalog: Autobahn OpenAPI (gekürzt) =="
curl -sSL --max-time 30 "https://autobahn.api.bund.dev/openapi.yaml" | head -c 4000
echo
