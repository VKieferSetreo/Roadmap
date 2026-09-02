#!/usr/bin/env bash
# Naechtliche Anreicherung auf der eigenen GPU (T-662).
#
# Max, 01.09.2026: "aktuell haben wir noch keinen KI-Server, ueber den wir das laufen lassen
# koennen. Mach einen Cronjob, der um 12:00 nachts die Workstation ueber WoL anhaut, alle neuen
# Befunde durch unsere Loops jagt wie bei der Retro, speichert und dann wieder ausmacht. Im
# Livebetrieb keine KI, nur dieser Job, der das einmal am Tag fuer alle macht."
#
# WARUM NACHTS UND NICHT IM IMPORT: das Gate im Importpfad hing an OpenRouter, und dessen freie
# Modelle sind kontingentiert — gemessen antworteten zwei von drei gar nicht. Ausserdem verzoegerte
# es jeden Sync. Die eigene Karte kostet nur Strom, ist ungedrosselt und faehrt die volle
# dreistufige Pipeline statt der abgespeckten.
#
# ABLAUF, und jeder Schritt kann fehlschlagen, ohne den naechsten zu verhindern:
#   1. Workstation wecken (nur wenn sie schlaeft) und warten, bis Ollama antwortet
#   2. Modell laden, damit der Erreichbarkeitstest des Laufs nicht in sein Zeitlimit rennt
#   3. Anreicherungslauf im eigenen Container — er nimmt sich nur, was noch keine Fertig-Marke hat
#      (vier Stroeme statt acht: das 14B belegt 15 der 24 GB, mehr passt nicht sinnvoll daneben)
#   4. Herunterfahren, IMMER (trap), auch bei Abbruch
#
# DIE WORKSTATION GEHT AM ENDE AUS, aber nur wenn WIR sie geweckt haben (Max, 01.09.2026: "wenn
# Server vorher schon an war NICHT ausmachen danach. Wenn er aus war, nach dem Job wieder ausmachen,
# wenn alles fertig ist"). War sie schon an, arbeitet jemand daran — dann bleibt sie an. Das ist der
# Unterschied zwischen einem Automaten und einem Aergernis.
#
# LAEUFT AUCH BEI ABBRUCH: der trap haengt am EXIT, nicht am Erfolgsfall. Eine Karte, die nach einem
# Fehler bis zum Morgen heizt, waere der teuerste Bug dieses Skripts.

set -uo pipefail

HELFER="admin@100.117.146.46"          # haengt im selben LAN wie die Workstation und ist immer an
MAC="24:4b:fe:4b:79:e0"
GPU="max@100.85.216.95"
# ZWEI SICHTEN AUF DENSELBEN DIENST, und sie sind nicht austauschbar:
#   OLLAMA       — wie der Anreicherungs-Container auf der VM ihn erreicht (ueber Tailscale)
#   OLLAMA_LOKAL — wie die Workstation ihn SELBST sieht
# Am 02.09.2026 im End-to-End-Test aufgefallen: der Bereitschaftstest lief per ssh AUF der
# Workstation, fragte aber ihre eigene Tailscale-Adresse ab. Kurz nach dem Booten antwortet die
# noch nicht (Tailscale ist da erst am Kommen), und der Lauf brach ab, obwohl Ollama laengst lief.
OLLAMA="http://100.85.216.95:11434"
OLLAMA_LOKAL="http://localhost:11434"
# Das GROESSERE Modell (Max, 01.09.2026: "nachts auch auf 14b laufen lassen"). Nachts zaehlt
# Genauigkeit, nicht Durchsatz — gemessen an den vorselektierten Punkten der zweiten Runde lieferte
# es 90 Prozent Ausbeute gegen 18 Prozent des 7B. Es ist dafuer rund fuenfmal langsamer, und genau
# dafuer ist die Nacht da.
MODELL="${NACHTLAUF_MODELL:-qwen2.5:14b-instruct}"
LOG="${NACHTLAUF_LOG:-$HOME/roadmap-nachtlauf.log}"
# Harte Obergrenze. Laeuft der Lauf laenger, ist etwas faul — dann lieber abbrechen und die Karte
# ausmachen, als sie bis mittags heizen zu lassen. Der naechste Lauf macht ohnehin dort weiter.
MAX_MIN="${NACHTLAUF_MAX_MIN:-300}"
SSH="ssh -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

sage() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }

WIR_HABEN_GEWECKT=0
aufraeumen() {
  if [ "$WIR_HABEN_GEWECKT" = "1" ]; then
    sage "Fahre die Workstation herunter (wir hatten sie geweckt)."
    $SSH "$GPU" "sudo -n shutdown -h now" >/dev/null 2>&1 || sage "Herunterfahren fehlgeschlagen — bitte nachsehen."
  else
    sage "Workstation war vorher schon an — bleibt an."
  fi
}
trap aufraeumen EXIT

sage "=== Nachtlauf startet ==="

# LAEUFT SCHON EINER? Dann raus, bevor irgendetwas geweckt oder gestartet wird. Zwei Laeufe auf
# derselben Karte halbieren nur das Tempo, und der zweite koennte dem ersten am Ende die
# Workstation unter den Fuessen ausschalten.
if sudo -n docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^anreicherung'; then
  sage "Es laeuft bereits eine Anreicherung — heute Nacht nichts zu tun."
  WIR_HABEN_GEWECKT=0
  exit 0
fi

# ── 1. Wecken ────────────────────────────────────────────────────────────────────────────────
if $SSH "$GPU" "true" >/dev/null 2>&1; then
  sage "Workstation ist bereits an."
else
  sage "Workstation schlaeft — sende Magic Packet ueber $HELFER."
  $SSH "$HELFER" "true" >>"$LOG" 2>&1   # der Schluessel ist dort auf genau diesen Weckbefehl festgelegt
  WIR_HABEN_GEWECKT=1
  for i in $(seq 1 40); do   # bis zu 200 s
    sleep 5
    if $SSH "$GPU" "true" >/dev/null 2>&1; then sage "Workstation ist nach $((i * 5)) s da."; break; fi
    [ "$i" = "40" ] && { sage "ABBRUCH: Workstation kam nicht hoch."; exit 1; }
  done
fi

# ── 2. Ollama und Modell bereitmachen ────────────────────────────────────────────────────────
# Den Docker-Daemon STARTEN, nicht auf ihn warten. Auf der Workstation sind docker.service und
# docker.socket abgeschaltet (`systemctl is-enabled docker` sagt disabled) — nach einem Kaltstart
# gibt es /var/run/docker.sock deshalb ueberhaupt nicht, und keine Wartezeit der Welt aendert das.
# Am 02.09.2026 gemessen: auch nach 643 s war der Socket nicht da. Der Vorgaenger dieser Zeilen
# wartete 90 s und meldete "Docker kommt nicht hoch" — richtig beobachtet, falsche Schlussfolgerung.
#
# Bewusst kein `systemctl enable`: das ist Max' Arbeitsrechner, und ob dort ein Daemon beim Booten
# mitlaeuft, entscheidet nicht dieses Skript. Wir starten, was wir brauchen, und lassen den
# Dauerzustand der Maschine in Ruhe.
$SSH "$GPU" "sudo -n systemctl start docker" >/dev/null 2>&1
for i in $(seq 1 24); do
  $SSH "$GPU" "docker info" >/dev/null 2>&1 && break
  sleep 5
  [ "$i" = "24" ] && { sage "ABBRUCH: Docker auf der Workstation kommt nicht hoch."; exit 1; }
done
$SSH "$GPU" "docker start ollama" >/dev/null 2>&1
# Bereitschaft AUS SICHT DER WORKSTATION pruefen (localhost), nicht ueber ihre Tailscale-Adresse.
for i in $(seq 1 36); do
  $SSH "$GPU" "curl -sf -m 5 $OLLAMA_LOKAL/api/tags -o /dev/null" && break
  sleep 5
  [ "$i" = "36" ] && { sage "ABBRUCH: Ollama antwortet nicht."; exit 1; }
done
# Und jetzt die Sicht, auf die es fuer den Lauf ankommt: von der VM aus ueber Tailscale. Steht
# Ollama zwar, ist aber von aussen nicht erreichbar, wuerde der Lauf gleich wieder abbrechen —
# besser hier feststellen, wo die Meldung noch etwas erklaert.
for i in $(seq 1 12); do
  curl -sf -m 5 "$OLLAMA/api/tags" -o /dev/null && break
  sleep 5
  [ "$i" = "12" ] && { sage "ABBRUCH: Ollama laeuft, ist aber von der VM aus nicht erreichbar."; exit 1; }
done
# Vorwaermen: das Laden eines Modells dauert laenger als der Erreichbarkeitstest des Laufs wartet
# (20 s), und der bricht dann ab, bevor ueberhaupt etwas passiert ist.
sage "Waerme $MODELL vor …"
$SSH "$GPU" "curl -s -m 600 $OLLAMA_LOKAL/api/generate -d '{\"model\":\"$MODELL\",\"prompt\":\"hi\",\"stream\":false,\"keep_alive\":\"6h\"}' -o /dev/null" \
  || { sage "ABBRUCH: Modell laesst sich nicht laden."; exit 1; }

# ── 3. Der Lauf ──────────────────────────────────────────────────────────────────────────────
IMAGE=$(sudo -n docker inspect -f '{{.Config.Image}}' "$(sudo -n docker ps -q --filter name=g13a8380 | head -1)" 2>/dev/null)
DB=$(sudo -n docker inspect "$(sudo -n docker ps -q --filter name=g13a8380 | head -1)" \
      --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^DATABASE_URL=' | cut -d= -f2-)
if [ -z "${IMAGE:-}" ] || [ -z "${DB:-}" ]; then sage "ABBRUCH: App-Container nicht gefunden."; exit 1; fi
sage "Starte Anreicherung mit $IMAGE"

sudo -n docker rm -f anreicherung-nacht >/dev/null 2>&1
sudo -n docker run --rm --name anreicherung-nacht --network setreo-net \
  -e DATABASE_URL="$DB" -e OLLAMA_URL="$OLLAMA/v1" -e ANREICHERUNG_WEG=lokal \
  -e ANREICHERUNG_MODELL="$MODELL" -e GLEICHZEITIG="${NACHTLAUF_PARALLEL:-4}" -e BLOCK=100 \
  "$IMAGE" timeout "${MAX_MIN}m" node scripts/anreicherungLauf.mjs >>"$LOG" 2>&1
ERGEBNIS=$?
sage "Anreicherung beendet (Code $ERGEBNIS)."
tail -3 "$LOG" | sed 's/^/    /'

# ── 4. In den Bestand, damit die Karte es zeigt ──────────────────────────────────────────────
sudo -n docker run --rm --network setreo-net -e DATABASE_URL="$DB" "$IMAGE" \
  node scripts/anreicherungNachpruefen.mjs --schreiben >>"$LOG" 2>&1 \
  && sage "In den Bestand eingespielt." || sage "Einspielen fehlgeschlagen (der naechste Lauf holt es)."

sage "=== Nachtlauf fertig ==="
