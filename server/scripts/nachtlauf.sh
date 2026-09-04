#!/usr/bin/env bash
# Taegliche Anreicherung auf der eigenen GPU, 12:00 Ortszeit (T-662).
#
# Max, 01.09.2026: "aktuell haben wir noch keinen KI-Server, ueber den wir das laufen lassen
# koennen. Mach einen Cronjob, der die Workstation ueber WoL anhaut, alle neuen Befunde durch
# unsere Loops jagt wie bei der Retro, speichert und dann wieder ausmacht. Im Livebetrieb keine
# KI, nur dieser Job, der das einmal am Tag fuer alle macht."
#
# DER NAME sagt noch "Nacht", die Uhr sagt Mittag: bis zum 03.09.2026 lief der Job um 22:00.
# Max hat ihn auf 12:00 gelegt, "zum Pull, wenn der durch is" — die Import-Slots um 12 Uhr sind
# gemessen nach spaetestens 15 Sekunden fertig, und dieses Skript rechnet ohnehin erst nach rund
# zwei Minuten Weck- und Aufwaermzeit. Die frischen Punkte des Tages sind also drin. Umbenannt
# wurde nichts, weil der Name in Cron, Kanban und Brain steht.
#
# WARUM NICHT IM IMPORT: das Gate im Importpfad hing an OpenRouter, und dessen freie Modelle sind
# kontingentiert — gemessen antworteten zwei von drei gar nicht. Ausserdem verzoegerte es jeden
# Sync. Die eigene Karte kostet nur Strom, ist ungedrosselt und faehrt die volle dreistufige
# Pipeline statt der abgespeckten.
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
# Die MAC 24:4b:fe:4b:79:e0 steht NICHT hier, sondern im forced command des Schluessels auf dem Pi.
# Deshalb reicht unten ein blankes `ssh $HELFER true`: der Pi kann mit diesem Schluessel nichts
# anderes tun, als genau dieses eine Magic Packet zu senden.
GPU="max@100.85.216.95"
# ZWEI SICHTEN AUF DENSELBEN DIENST, und sie sind nicht austauschbar:
#   OLLAMA       — wie der Anreicherungs-Container auf der VM ihn erreicht (ueber Tailscale)
#   OLLAMA_LOKAL — wie die Workstation ihn SELBST sieht
# Am 02.09.2026 im End-to-End-Test aufgefallen: der Bereitschaftstest lief per ssh AUF der
# Workstation, fragte aber ihre eigene Tailscale-Adresse ab. Kurz nach dem Booten antwortet die
# noch nicht (Tailscale ist da erst am Kommen), und der Lauf brach ab, obwohl Ollama laengst lief.
OLLAMA="http://100.85.216.95:11434"
OLLAMA_LOKAL="http://localhost:11434"
# Das GROESSERE Modell (Max, 01.09.2026: "auch auf 14b laufen lassen"). Hier zaehlt Genauigkeit,
# nicht Durchsatz — gemessen an den vorselektierten Punkten der zweiten Runde lieferte es 90 Prozent
# Ausbeute gegen 18 Prozent des 7B. Es ist dafuer rund fuenfmal langsamer, und das ist es wert:
# der Lauf hat einen ganzen Nachmittag Zeit, niemand wartet auf ihn.
MODELL="${NACHTLAUF_MODELL:-qwen2.5:14b-instruct}"
LOG="${NACHTLAUF_LOG:-$HOME/roadmap-nachtlauf.log}"
# Harte Obergrenze. Laeuft der Lauf laenger, ist etwas faul — dann lieber abbrechen und die Karte
# ausmachen, als sie bis in die Nacht heizen zu lassen. Der naechste Lauf macht dort weiter.
MAX_MIN="${NACHTLAUF_MAX_MIN:-300}"
SSH="ssh -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

sage() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }

# EIN LAUF ZUR ZEIT, und zwar bevor irgendetwas anderes passiert. Weiter unten steht zwar noch
# eine Pruefung auf einen laufenden Container, aber die hat ein Zeitfenster: zwischen "kein
# Container da" und "Container gestartet" liegen Minuten Weckzeit, in denen ein zweiter Aufruf
# genauso zu dem Schluss kaeme, es sei nichts zu tun. Zwei Laeufe auf einer Karte halbieren nicht
# nur das Tempo — der eine schaltet dem anderen am Ende die Maschine ab.
exec 9>"${NACHTLAUF_LOCK:-/tmp/roadmap-nachtlauf.lock}"
if ! flock -n 9; then
  echo "[$(date '+%F %T')] Ein Nachtlauf laeuft bereits (Sperre belegt) — dieser Aufruf endet." | tee -a "$LOG"
  exit 0
fi

WIR_HABEN_GEWECKT=0
IMAGE=""
DB=""
UMGEBUNG=""
# Sammelt, was schiefging. Ist es am Ende nicht leer, geht eine Mail raus — und zwar nur dann.
PROBLEM=""

# Abbrechen und den Grund merken, statt ihn nur ins Logfile zu schreiben, das keiner liest.
abbruch() { PROBLEM="$1"; sage "ABBRUCH: $1"; exit 1; }

# ERST SICHERN, DANN AUSMACHEN — und beides im trap, damit es auch bei Abbruch passiert.
#
# Max, 02.09.2026: "sicherstellen, dass wenn fertig alles sauber abgelegt und gespeichert wird,
# und wenn's dann sauber auf Prod ist, erst Workstation runtergefahren wird, bevor Daten verloren
# gehen."
#
# Vorher stand das Einspielen im normalen Ablauf und der Shutdown im trap. Das ist die falsche
# Reihenfolge fuer jeden Weg, der nicht bis zum Ende laeuft: bricht der Lauf im Zeitlimit ab oder
# faengt das Skript ein Signal, fuhr die Workstation herunter und die gerechneten Angaben blieben
# in der Anreicherungstabelle liegen, ohne je im Bestand anzukommen.
#
# Der frueher hier notierte Zielkonflikt — "eine Karte, die nach einem Fehler bis zum Morgen heizt,
# waere der teuerste Bug dieses Skripts" — ist keiner: das Einspielen laeuft auf der VM gegen
# Postgres und braucht die Workstation ueberhaupt nicht. Es kostet Sekunden, nicht Stunden.
sichern() {
  # FEHLENDE VORAUSSETZUNGEN SIND EIN PROBLEM, KEIN NORMALFALL. Die erste Fassung gab hier still
  # `return 0` zurueck — und am 02.09.2026 lief genau das: UMGEBUNG war nie befuellt worden, also
  # meldete das Skript "nichts einzuspielen", vermerkte kein Problem, verschickte keine Mail und
  # fuhr die Workstation herunter. Ein Waechter, der bei eigener Blindheit Entwarnung gibt, ist
  # schlimmer als keiner: er sieht aus, als haette er geprueft.
  if [ -z "$IMAGE" ] || [ -z "$UMGEBUNG" ]; then
    sage "ACHTUNG: kann nicht einspielen — App-Container oder Umgebung fehlen."
    PROBLEM="${PROBLEM:+$PROBLEM; }Einspielen nicht moeglich (App-Container/Umgebung fehlen)"
    return 1
  fi
  for versuch in 1 2 3; do
    sudo -n docker run --rm --network setreo-net --env-file "$UMGEBUNG" "$IMAGE" \
      node scripts/anreicherungNachpruefen.mjs --schreiben >>"$LOG" 2>&1
    # NACHZAEHLEN statt dem Einspielen glauben: die Zahl der angefassten Zeilen sagt nicht, ob
    # danach nichts mehr offen ist. Nur diese Abfrage sagt es.
    AUSKUNFT=$(sudo -n docker run --rm --network setreo-net --env-file "$UMGEBUNG" "$IMAGE" \
                 node scripts/anreicherungOffen.mjs 2>&1)
    case "$?" in
      0) sage "Bestand vollstaendig: $AUSKUNFT"; return 0 ;;
      1) sage "Versuch $versuch: $AUSKUNFT — spiele erneut ein." ;;
      *) sage "Versuch $versuch: konnte nicht nachzaehlen ($AUSKUNFT)." ;;
    esac
    sleep 10
  done
  # Nach drei Versuchen ist das Einspielen nicht das Problem, sondern etwas darunter. Die
  # gerechneten Angaben sind deshalb NICHT verloren: sie stehen in der Anreicherungstabelle, und
  # der naechste Lauf spielt sie ein. Verloren waere nur die Sichtbarkeit auf der Karte.
  sage "ACHTUNG: Einspielen dreimal nicht bestaetigt. Die Angaben liegen in der Anreicherungstabelle"
  sage "         und gehen nicht verloren, sind aber noch nicht auf der Karte."
  PROBLEM="${PROBLEM:+$PROBLEM; }Einspielen dreimal nicht bestaetigt"
  return 1
}

# Die einzige Stelle, an der dieses Skript jemanden erreicht. Alles andere landet in einem Logfile
# auf einer VM, in das niemand sieht — und ein Automat, dessen Ausfall unbemerkt bleibt, ist
# gefaehrlicher als gar keiner: er sieht wochenlang so aus, als taete er seine Arbeit.
melden() {
  [ -n "$IMAGE" ] && [ -n "$UMGEBUNG" ] || return 0
  sudo -n docker run --rm --network setreo-net --env-file "$UMGEBUNG" "$IMAGE" \
    node scripts/nachtlaufMelden.mjs "$1" "$2" >>"$LOG" 2>&1 \
    || sage "Auch die Meldung ging nicht raus — bitte $LOG ansehen."
}

aufraeumen() {
  sichern
  if [ "$WIR_HABEN_GEWECKT" = "1" ]; then
    sage "Fahre die Workstation herunter (wir hatten sie geweckt)."
    $SSH "$GPU" "sudo -n shutdown -h now" >/dev/null 2>&1 \
      || { sage "Herunterfahren fehlgeschlagen — bitte nachsehen."
           PROBLEM="${PROBLEM:+$PROBLEM; }Workstation liess sich nicht herunterfahren"; }
  else
    sage "Workstation war vorher schon an — bleibt an."
  fi

  # NUR BEI PROBLEMEN. Eine Mail, die jede Nacht kommt, liest nach einer Woche niemand mehr.
  if [ -n "$PROBLEM" ]; then
    melden "Roadmap-Nachtlauf: $PROBLEM" \
"Der naechtliche Anreicherungslauf hatte ein Problem:

    $PROBLEM

Was das bedeutet: die betroffenen Punkte behalten keine Fertig-Marke und kommen in der
naechsten Nacht automatisch erneut dran. Es geht nichts verloren, und die Karte zeigt sie
solange ohne die abgeleiteten Angaben — also mit dem, was die Behoerde selbst gemeldet hat.

Die letzten Zeilen aus dem Log:

$(tail -12 "$LOG")"
  fi
  [ -n "$UMGEBUNG" ] && rm -f "$UMGEBUNG"
  sage "=== Nachtlauf fertig ==="
}
trap aufraeumen EXIT

sage "=== Nachtlauf startet ==="

# LAEUFT SCHON EINER? Dann raus, bevor irgendetwas geweckt oder gestartet wird. Zwei Laeufe auf
# derselben Karte halbieren nur das Tempo, und der zweite koennte dem ersten am Ende die
# Workstation unter den Fuessen ausschalten.
if sudo -n docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^anreicherung'; then
  sage "Es laeuft bereits eine Anreicherung — heute Nacht nichts zu tun."
  # Ohne trap raus: der andere Lauf spielt selbst ein und macht selbst aus. Wer sich hier
  # einmischt, nimmt ihm die Arbeit unter den Haenden weg.
  trap - EXIT
  exit 0
fi

# DEN APP-CONTAINER ZUERST, vor dem Wecken. Ohne Image und Datenbank gibt es nichts zu rechnen —
# dann muss auch niemand eine Grafikkarte aufwecken, um das drei Minuten spaeter festzustellen.
APP=$(sudo -n docker ps -q --filter name=g13a8380 | head -1)
IMAGE=$(sudo -n docker inspect -f '{{.Config.Image}}' "$APP" 2>/dev/null)
DB=$(sudo -n docker inspect "$APP" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
      | grep '^DATABASE_URL=' | cut -d= -f2-)
if [ -z "${IMAGE:-}" ] || [ -z "${DB:-}" ]; then abbruch "App-Container nicht gefunden"; fi

# Die Umgebung fuer unsere eigenen Container: Datenbank fuers Einspielen, Mailjet fuer die Meldung.
# Als Datei statt als -e, weil die Werte Sonderzeichen enthalten und eine env-file sie nicht durch
# die Shell schleift. mktemp gehoert nur dem Aufrufer (0600) — dieselben Werte stehen ohnehin in
# jedem `docker inspect` dieses Hosts.
UMGEBUNG=$(mktemp)
sudo -n docker inspect "$APP" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | grep -E '^(DATABASE_URL|MAILJET_[A-Z_]+|ROADMAP_ADMIN_EMAILS)=' > "$UMGEBUNG"
if ! grep -q '^DATABASE_URL=' "$UMGEBUNG"; then abbruch "Umgebung des App-Containers nicht lesbar"; fi

# ── 1. Wecken ────────────────────────────────────────────────────────────────────────────────
if $SSH "$GPU" "true" >/dev/null 2>&1; then
  sage "Workstation ist bereits an."
  # WENN SIE SCHON LAEUFT, ARBEITET WAHRSCHEINLICH JEMAND DARAN (Max, 04.09.2026: "kann auch
  # sein, dass die Workstation schon an ist, das gerne mal mitdenken"). Dass sie anbleibt, war
  # schon geregelt — dass wir ihr niemandem das VRAM wegnehmen, noch nicht. Das 14B belegt 15 der
  # 24 GB; ein laufendes Training daneben stirbt daran mit OOM.
  #
  # Gemessen wird VOR dem Start des Ollama-Containers: laeuft der schon, ist er selbst der
  # Belegende und die Zahl saegt nichts mehr aus — dann ist die Karte ohnehin fuer uns in Betrieb.
  # Im Leerlauf zeigt die 3090 rund 1 MiB, die Schwelle von 2 GB trifft also nur echte Nutzung.
  if ! $SSH "$GPU" "docker ps --format '{{.Names}}' 2>/dev/null | grep -qx ollama"; then
    VRAM=$($SSH "$GPU" "nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits" 2>/dev/null | tr -cd '0-9')
    if [ -n "${VRAM:-}" ] && [ "$VRAM" -gt "${GPU_BELEGT_AB_MIB:-2000}" ]; then
      sage "Die Karte haelt bereits $VRAM MiB — da arbeitet jemand. Heute kein Lauf."
      sage "Die offenen Punkte bleiben offen und kommen morgen dran. Mit GPU_BELEGT_AB_MIB"
      sage "laesst sich die Schwelle verschieben, mit einem sehr hohen Wert abschalten."
      # Kein PROBLEM und keine Mail: das ist gewolltes Verhalten, kein Fehler. Der trap laeuft
      # trotzdem — er spielt ein (findet nichts Neues) und laesst die Workstation an, weil wir
      # sie nicht geweckt haben.
      exit 0
    fi
  fi
else
  sage "Workstation schlaeft — sende Magic Packet ueber $HELFER."
  $SSH "$HELFER" "true" >>"$LOG" 2>&1   # der Schluessel ist dort auf genau diesen Weckbefehl festgelegt
  WIR_HABEN_GEWECKT=1
  for i in $(seq 1 40); do   # bis zu 200 s
    sleep 5
    if $SSH "$GPU" "true" >/dev/null 2>&1; then sage "Workstation ist nach $((i * 5)) s da."; break; fi
    [ "$i" = "40" ] && abbruch "Workstation kam nach dem Weckruf nicht hoch"
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
  [ "$i" = "24" ] && abbruch "Docker auf der Workstation kommt nicht hoch"
done
# DEN RUECKGABEWERT LESEN. In der Nacht zum 03.09.2026 stand hier ein `>/dev/null 2>&1` ohne
# Pruefung — der Container `ollama` existierte gar nicht mehr (die gesamte Docker-Datenwurzel war
# leer, 212 KB), `docker start` sagte "No such container", und das Skript wartete danach drei
# Minuten auf einen Dienst, den niemand gestartet hatte. Gemeldet wurde "Ollama antwortet nicht":
# richtig beobachtet, und wieder die falsche Ursache. Zum zweiten Mal in dieser Datei derselbe
# Fehler — ein weggeworfener Fehlertext kostet den naechsten Leser eine Stunde.
FEHLER=$($SSH "$GPU" "docker start ollama" 2>&1)
if [ $? -ne 0 ]; then
  case "$FEHLER" in
    *"No such container"*) abbruch "Der Container 'ollama' existiert auf der Workstation nicht mehr" ;;
    *) abbruch "Ollama-Container laesst sich nicht starten: $(echo "$FEHLER" | head -1)" ;;
  esac
fi
# Bereitschaft AUS SICHT DER WORKSTATION pruefen (localhost), nicht ueber ihre Tailscale-Adresse.
for i in $(seq 1 36); do
  $SSH "$GPU" "curl -sf -m 5 $OLLAMA_LOKAL/api/tags -o /dev/null" && break
  sleep 5
  [ "$i" = "36" ] && abbruch "Ollama antwortet nicht"
done
# Und jetzt die Sicht, auf die es fuer den Lauf ankommt: von der VM aus ueber Tailscale. Steht
# Ollama zwar, ist aber von aussen nicht erreichbar, wuerde der Lauf gleich wieder abbrechen —
# besser hier feststellen, wo die Meldung noch etwas erklaert.
for i in $(seq 1 12); do
  curl -sf -m 5 "$OLLAMA/api/tags" -o /dev/null && break
  sleep 5
  [ "$i" = "12" ] && abbruch "Ollama laeuft, ist aber von der VM aus nicht erreichbar"
done
# Vorwaermen: das Laden eines Modells dauert laenger als der Erreichbarkeitstest des Laufs wartet
# (20 s), und der bricht dann ab, bevor ueberhaupt etwas passiert ist.
sage "Waerme $MODELL vor …"
$SSH "$GPU" "curl -s -m 600 $OLLAMA_LOKAL/api/generate -d '{\"model\":\"$MODELL\",\"prompt\":\"hi\",\"stream\":false,\"keep_alive\":\"6h\"}' -o /dev/null" \
  || abbruch "Modell laesst sich nicht laden"

# ── 3. Der Lauf ──────────────────────────────────────────────────────────────────────────────
sage "Starte Anreicherung mit $IMAGE"

sudo -n docker rm -f anreicherung-nacht >/dev/null 2>&1
sudo -n docker run --rm --name anreicherung-nacht --network setreo-net \
  -e DATABASE_URL="$DB" -e OLLAMA_URL="$OLLAMA/v1" -e ANREICHERUNG_WEG=lokal \
  -e ANREICHERUNG_MODELL="$MODELL" -e GLEICHZEITIG="${NACHTLAUF_PARALLEL:-4}" -e BLOCK=100 \
  "$IMAGE" timeout "${MAX_MIN}m" node scripts/anreicherungLauf.mjs >>"$LOG" 2>&1
ERGEBNIS=$?
sage "Anreicherung beendet (Code $ERGEBNIS)."
tail -3 "$LOG" | sed 's/^/    /'

# Schritt 4 (in den Bestand einspielen und nachzaehlen) und Schritt 5 (herunterfahren) stehen
# oben in aufraeumen(). Sie gehoeren dorthin, weil sie auch dann laufen muessen, wenn dieses
# Skript den Weg bis hierher gar nicht schafft — und weil das Ausschalten auf das Einspielen
# warten soll, nicht umgekehrt.
