#!/usr/bin/env bash
# Führt ALLE Cron-Jobs aus (pull + Format-Bau in einem). Default: Dry-Run (nur Verifikations-JSON).
# DB-Schreiben scharf:  ROADMAP_WRITE_DB=1 DATABASE_URL=postgres://... bash run-crons.sh
#   (setzt angewandte Migration 005 + `npm i` voraus)
# Optionaler Pfad-Filter:  bash run-crons.sh Hamburg
set -uo pipefail
cd "$(dirname "$0")"
FILTER="${1:-}"
ok=0; fail=0; total=0; summe=0
printf "%-58s %s\n" "CRON-JOB" "DATENSÄTZE"
printf '%s\n' "──────────────────────────────────────────────────────────────────────"
while IFS= read -r job; do
  d="$(dirname "$job")"; f="$(basename "$job")"
  [ -n "$FILTER" ] && case "$d" in *"$FILTER"*) ;; *) continue;; esac
  total=$((total+1))
  out="$(cd "$d" && timeout 120 node "$f" 2>&1)"
  n="$(printf '%s' "$out" | grep -oE 'normalisiert: [0-9]+' | grep -oE '[0-9]+' | head -1)"
  db="$(printf '%s' "$out" | grep -oE '→ DB: .*' | head -1)"
  if [ -n "${n:-}" ]; then
    ok=$((ok+1)); summe=$((summe + n)); printf "%-58s %s\n" "${d#./}" "${n}${db:+  ($db)}"
  else
    fail=$((fail+1)); printf "%-58s %s\n" "${d#./}" "FEHLER (Endpunkt prüfen)"
  fi
done < <(find . -name '*.cron.mjs' | sort)
printf '%s\n' "──────────────────────────────────────────────────────────────────────"
printf "Σ %d Jobs · OK %d · Fehler %d · Datensätze gesamt %d\n" "$total" "$ok" "$fail" "$summe"
