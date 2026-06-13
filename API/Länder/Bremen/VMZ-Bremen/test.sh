#!/usr/bin/env bash
# VMZ Bremen — Web-Portal, kein offener maschinenlesbarer Endpunkt.
# Der referenzierte RSS-Pfad liefert HTML (TYPO3), kein echtes RSS.
# Dieser Call prüft Portal-Erreichbarkeit + zeigt, dass der "RSS"-Pfad HTML ist.
# LIZENZ-Hinweis: CC BY-NC-ND — kommerzielle Nutzung gesondert klären.
set -euo pipefail

echo "== VMZ Bremen Portal (HTTP-Status) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "https://www.vmz.bremen.de/"
echo
echo "== 'RSS'-Pfad Content-Type-Probe (erwartet text/html, kein RSS) =="
curl -sSL --max-time 30 -o /dev/null -w "HTTP %{http_code} | %{content_type}\n" "https://www.vmz.bremen.de/verkehrslage/aktuell/feed.rss"
echo
