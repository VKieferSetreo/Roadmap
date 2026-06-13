#!/usr/bin/env bash
# Health-Check über ALLE Quellen im API-Katalog.
# Führt jedes test.sh aus und meldet, ob echte Daten zurückkommen.
#   bash run-all.sh            # alle
#   bash run-all.sh Bundesweit # nur ein Teilbaum (Pfad-Filter)
# Legende:  OK = Daten erhalten · LEER = Antwort leer/Fehler · 🔑 = Account/Key nötig (übersprungen)
set -uo pipefail
cd "$(dirname "$0")"
FILTER="${1:-}"
ok=0; fail=0; gated=0; total=0
printf "%-4s %-58s %s\n" "" "QUELLE (Ordner)" "ERGEBNIS"
printf '%s\n' "────────────────────────────────────────────────────────────────────────"
while IFS= read -r t; do
  d="$(dirname "$t")"
  [ -n "$FILTER" ] && case "$d" in *"$FILTER"*) ;; *) continue;; esac
  total=$((total+1))
  # gated? (.env im Ordner) → überspringen
  if ls "$d"/*.env >/dev/null 2>&1; then
    gated=$((gated+1)); printf "🔑   %-58s %s\n" "${d#./}" "Account/Key nötig"; continue
  fi
  out="$(cd "$d" && timeout 30 bash test.sh 2>/dev/null)"
  # „Daten erhalten" = enthält JSON/XML/GML-Marker und ist nennenswert lang
  if printf '%s' "$out" | grep -qE '\{|<|FeatureCollection|features|roadworks|elements|"results"' && [ "${#out}" -gt 80 ]; then
    ok=$((ok+1)); bytes=${#out}; printf "OK   %-58s %s\n" "${d#./}" "${bytes} B"
  else
    fail=$((fail+1)); printf "LEER %-58s %s\n" "${d#./}" "(Endpunkt prüfen)"
  fi
done < <(find . -name test.sh | sort)
printf '%s\n' "────────────────────────────────────────────────────────────────────────"
printf "Σ %d getestet · OK %d · LEER %d · 🔑 %d übersprungen\n" "$total" "$ok" "$fail" "$gated"
