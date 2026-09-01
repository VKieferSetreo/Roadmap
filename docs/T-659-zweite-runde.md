# Zweite Runde: die abgewiesenen Punkte mit dem 14B (T-659)

Stand 01.09.2026, während der erste Durchgang läuft. Zahlen aus dem Bestand zum Zeitpunkt der
Planung (53.235 von 72.541 Punkten fertig), sie wachsen bis zum Start noch.

## Was liegt vor

37.985 Verwerfungen auf 10.289 Punkten. Sortiert nach dem, was ein größeres Modell daran ändern
könnte:

| Grund | Zeilen | Punkte | Lohnt ein zweiter Versuch? |
|---|---:|---:|---|
| Platzhalter statt Angabe | 18.391 | 1.384 | **Nein.** Der Punkt hat keinen Text |
| kein Beleg angegeben | 2.756 | 168 | **Ja, stark.** 16 Zeilen je Punkt — das Modell bricht dort das Format |
| Beleg steht nicht im Quelltext | 2.096 | 1.346 | **Ja.** Erfundene Textstelle, ein größeres Modell zitiert genauer |
| Beleg passt nicht zum Feld zeitfenster | 1.440 | 1.380 | **Vielleicht.** Datumsspanne statt Tagesfenster, eine Verständnisfrage |
| Beleg zitiert den Rahmen | 1.407 | 968 | **Ja.** Formatverständnis |
| Wert folgt nicht aus dem Beleg (0/1/2) | 3.308 | ~2.200 | **Ja.** Das Modell rechnet, statt zu lesen |
| Beleg betrifft nur den Geh-/Radweg | 1.088 | 781 | **Nein.** Die Meldung betrifft wirklich nur den Gehweg |

Zwei Gründe sind also aussichtslos und werden ausgeschlossen: **Platzhalter** (kein Text vorhanden)
und **Geh-/Radweg** (die Aussage wurde richtig erkannt und ist für einen Schwertransport
bedeutungslos). Das spart rund die Hälfte der Zeilen.

**Auswahl für die zweite Runde: rund 9.400 Punkte** statt 10.289.

## Wie sie läuft

```
docker run -d --name anreicherung-14b --network setreo-net \
  -e DATABASE_URL="…" -e OLLAMA_URL="http://100.85.216.95:11434/v1" \
  -e ANREICHERUNG_MODELL=qwen2.5:14b-instruct \
  -e NUR_VERWERFUNGEN_VON=qwen2.5:7b-instruct \
  -e GLEICHZEITIG=4 \
  <app-image> node scripts/anreicherungLauf.mjs
```

`GLEICHZEITIG=4` statt 8: das 14B belegt 9 GB statt 4,7, und die Karte war schon mit dem 7B bei
100 Prozent Auslastung. Mehr Ströme bringen keinen Durchsatz, kosten aber KV-Cache.

**Eigener Modellname, eigene Zeilen.** Das Ergebnis des 7B bleibt daneben stehen. Der
Eindeutigkeits-Index geht über (Ziel, Feld, Modell), es kollidiert also nichts, und hinterher lässt
sich Feld für Feld vergleichen, statt zu vermuten.

**Beim Einspielen gewinnt der Bestand.** `spieleEin` schreibt `a.werte || o.attrs` — was schon
dasteht, bleibt. Die zweite Runde füllt Lücken, sie überschreibt nichts.

## Der eigentliche Kniff: das Modell weiß, wo es hinsehen soll

Ein zweiter Durchgang, der dieselbe Frage nochmal stellt, ist nur ein zweiter Würfelwurf. Das 14B
bekommt deshalb mit, an welchen Feldern der erste Versuch am Beleg gescheitert ist:

> Bei diesem Datensatz ist ein erster Leseversuch an folgenden Feldern gescheitert, weil der Beleg
> nicht zum Text passte: spurenGesperrt, zeitfenster. Sieh dort besonders genau hin und zitiere die
> Textstelle wörtlich.

**Ohne den Wert des ersten Versuchs.** Nur die Feldnamen. Stünde der Wert dabei, wäre es eine
Vorlage zum Abschreiben — das Modell würde ihn übernehmen und einen passenden Beleg dazu suchen,
und genau diese Reihenfolge (erst Antwort, dann Begründung) soll die Belegpflicht verhindern.

Die Feldliste kommt aus derselben Abfrage, die die Kandidaten wählt, kostet also keinen zusätzlichen
Rundlauf zur Datenbank.

## Woran wir messen, ob es etwas gebracht hat

Nach dem Lauf `scripts/anreicherungVergleich.mjs`. Es stellt drei Fragen:

1. **Zugewinn:** Felder, die das 14B belegt hat und das 7B nicht. Das ist die Zahl, um die es geht.
2. **Widerspruch:** Felder, die beide beantwortet haben, mit verschiedenen Werten. Jeder davon ist
   ein Fall zum Ansehen — zwei Modelle, die dieselbe Textstelle verschieden lesen, sind ein Hinweis
   auf eine unklare Frage, nicht auf ein schlechtes Modell.
3. **Rückstand:** Felder, die das 7B belegt hat und das 14B nicht. Wenn das häufig vorkommt, ist der
   Fokus-Hinweis zu eng und lenkt vom Rest ab.

## Was wir NICHT tun

- **Kein Überschreiben** bestehender Werte durch das größere Modell. Beide sind durch dieselben
  Riegel gegangen; wo beide etwas sagen, gilt das Ältere, und der Widerspruch wird berichtet statt
  still aufgelöst.
- **Keine dritte Runde auf denselben Punkten.** Bringt der zweite Durchgang wenig, liegt es nicht am
  Modell, sondern am Text — dann ist der Hebel die Quelle (siehe `roh`, München), nicht die
  Modellgröße.
- **Keine Verwerfung löschen.** Sie bleiben, wie besprochen, vollständig erhalten.
