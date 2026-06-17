-- 025 — Autobahn GmbH lastbeschränkte Brücken (bundesweit, GST-ArcGIS-Viewer).
-- Sicherheitskritisch: Brücken, über die genehmigungspflichtiger Schwerverkehr nicht/nur
-- beschränkt darf. FK-Anker für Connector 0150. Idempotent.

INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall) VALUES
  ('0150', 'Autobahn GmbH — Lastbeschränkte Brücken (GST, bundesweit)', 'api', 'T1', 'amtlich', '0 8,12,18 * * *')
ON CONFLICT (id) DO NOTHING;
