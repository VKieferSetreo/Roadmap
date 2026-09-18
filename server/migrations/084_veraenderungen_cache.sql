-- T-747-Nachbesserung (18.09., Max: "einmal morgens alle Daten ready, das ist nur noch Visu").
-- Die /uebersicht-Query braucht ~55s (Anti-Join gegen den vollen Bestand) — zu teuer, um sie bei
-- jedem Seitenaufruf live zu rechnen. Ein taeglicher Worker-Cron befuellt diese Tabelle, die Route
-- liest nur noch daraus. Kategorien sind fix "alle" (das Frontend fragt nie eine Teilmenge ab),
-- deshalb genuegt `tage` als Schluessel.
CREATE TABLE IF NOT EXISTS veraenderungen_cache (
  tage int PRIMARY KEY,
  payload jsonb NOT NULL,
  berechnet_am timestamptz NOT NULL DEFAULT now()
);
