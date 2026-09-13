-- 080 — Fahrbahnbreiten aus dem ATKIS-Landschaftsmodell für Thüringen und Mecklenburg-Vorpommern (T-729).
--
-- Beide Länder hatten keine Breiten-Quelle. Das Basis-DLM führt die Fahrbahnbreite je Straßenachse,
-- offen per WFS: Thüringen für 98,6 % des klassifizierten Netzes, Mecklenburg-Vorpommern für 79 %.
--
-- Der Wert ist aus dem Luftbild erfasst und auf 0,5 m gerundet. Gegen die gemessenen BAYSIS-Breiten
-- in Bayern gehalten, trifft er die versprochenen ±0,25 m nur in 37-44 % und liegt meist zu schmal.
-- Deshalb tragen die Einträge ein Toleranzband (breiteToleranzUntenM 0,5 / breiteToleranzObenM 1,0),
-- und ruleEngstelle warnt aus der Untergrenze, wertet kritisch nur, wenn selbst die Obergrenze nicht
-- reicht. Übernommen werden nur Bundes-, Landes- und Kreisstraßen mit Gegenverkehr, 2,5 bis 4,0 m.
--
-- Nachgerechnet vor dem Livegang (13.09.2026) an allen fertigen Produktionsprojekten: 2 neue
-- Warnungen, 0 kritische. Die übrigen Strecken durch beide Länder fahren über Autobahn und breite
-- Bundesstraßen.
--
-- Lizenzen aus den Diensten selbst gelesen: Thüringen dl-de/by-2-0 (© GDI-Th), Mecklenburg-Vorpommern
-- CC BY 4.0 (© GeoBasis-DE/M-V). Kommerzielle Nutzung erlaubt, Namensnennung im Quellennamen.
INSERT INTO quellen (id, name, typ, endpoint_url, aktiv, lizenz, lizenz_status)
VALUES
  ('0235', 'Thüringen — Fahrbahnbreiten ATKIS Basis-DLM (GDI-Th)', 'wfs',
   'https://www.geoproxy.geoportal-th.de/geoproxy/services/adv_atkis_wfs',
   true, 'dl-de/by-2-0 (Namensnennung: © GDI-Th)', 'ready'),
  ('0236', 'Mecklenburg-Vorpommern — Fahrbahnbreiten ATKIS Basis-DLM (LAiV M-V)', 'wfs',
   'https://www.geodaten-mv.de/dienste/atkis_bdlm_wfs_sf',
   true, 'CC BY 4.0 (Namensnennung: © GeoBasis-DE/M-V)', 'ready')
ON CONFLICT (id) DO NOTHING;
