-- 008 — Demo-Schwertransport-Projekt fuer Tenant 'setreo' (mxk@setreo.de).
-- Route A7 Hamburg->Kassel entlang ECHTER Baustellen-Koordinaten (oeffentliche
-- Autobahn-API, Stand 2026-06-13, 80 Punkte). Einmalig geseedet, damit die
-- Auswertung gegen echte Daten getestet werden kann. Idempotent (NOT EXISTS);
-- jederzeit im UI loeschbar (Projekt-Menue). Laeuft transaktional ueber migrate.js.

INSERT INTO projects (name, status, tenant_id, routes, transport, zeitraum, created_by)
SELECT
  'Demo Schwertransport A7 (Hamburg -> Kassel)',
  'entwurf',
  t.id,
  '[{"id":"r-demo-a7","name":"A7 Hamburg -> Kassel","fileName":"demo-a7-baustellen.geojson","farbe":"#3D5A80","points":[{"lat":53.58787,"lng":9.91536},{"lat":53.5796,"lng":9.91427},{"lat":53.57593,"lng":9.90814},{"lat":53.53151,"lng":9.9339},{"lat":53.51986,"lng":9.9239},{"lat":53.51618,"lng":9.91798},{"lat":53.51398,"lng":9.91555},{"lat":53.43289,"lng":9.93384},{"lat":53.41731,"lng":9.97565},{"lat":53.37542,"lng":10.02059},{"lat":53.35931,"lng":10.0369},{"lat":53.32793,"lng":10.04821},{"lat":53.28544,"lng":10.07893},{"lat":53.24509,"lng":10.08348},{"lat":53.24163,"lng":10.08185},{"lat":53.22842,"lng":10.07629},{"lat":53.22036,"lng":10.07605},{"lat":53.2159,"lng":10.0769},{"lat":52.84835,"lng":9.6923},{"lat":52.84519,"lng":9.68956},{"lat":52.83734,"lng":9.68645},{"lat":52.83062,"lng":9.68544},{"lat":52.82794,"lng":9.68495},{"lat":52.81157,"lng":9.68021},{"lat":52.79215,"lng":9.67369},{"lat":52.64595,"lng":9.70935},{"lat":52.55725,"lng":9.7912},{"lat":52.35875,"lng":9.88568},{"lat":52.35603,"lng":9.8819},{"lat":52.29651,"lng":9.88808},{"lat":52.24807,"lng":9.92402},{"lat":52.22113,"lng":9.93368},{"lat":52.13661,"lng":10.01376},{"lat":52.12226,"lng":10.06636},{"lat":52.1172,"lng":10.12334},{"lat":52.10611,"lng":10.14071},{"lat":52.09207,"lng":10.17207},{"lat":52.07986,"lng":10.18866},{"lat":51.99202,"lng":10.15537},{"lat":51.9581,"lng":10.13985},{"lat":51.90477,"lng":10.13347},{"lat":51.86805,"lng":10.12665},{"lat":51.85056,"lng":10.12317},{"lat":51.79207,"lng":10.06626},{"lat":51.77818,"lng":10.03098},{"lat":51.77403,"lng":10.02821},{"lat":51.73683,"lng":9.98206},{"lat":51.7331,"lng":9.97133},{"lat":51.72361,"lng":9.9495},{"lat":51.69761,"lng":9.93759},{"lat":51.67202,"lng":9.92247},{"lat":51.63474,"lng":9.92039},{"lat":51.62462,"lng":9.91538},{"lat":51.60916,"lng":9.90741},{"lat":51.6005,"lng":9.90435},{"lat":51.5911,"lng":9.9069},{"lat":51.57057,"lng":9.89918},{"lat":51.56107,"lng":9.87921},{"lat":51.55048,"lng":9.87936},{"lat":51.52621,"lng":9.87911},{"lat":51.51905,"lng":9.87883},{"lat":51.46896,"lng":9.87154},{"lat":51.4554,"lng":9.86659},{"lat":51.40841,"lng":9.82167},{"lat":51.4066,"lng":9.8167},{"lat":51.40076,"lng":9.70402},{"lat":51.39895,"lng":9.70084},{"lat":51.34364,"lng":9.5986},{"lat":51.3299,"lng":9.57866},{"lat":51.31557,"lng":9.56194},{"lat":51.30933,"lng":9.55972},{"lat":51.3031,"lng":9.5615},{"lat":51.29832,"lng":9.56258},{"lat":51.29056,"lng":9.55515},{"lat":51.28337,"lng":9.54233},{"lat":51.27971,"lng":9.53589},{"lat":51.27195,"lng":9.52228},{"lat":51.26584,"lng":9.51677},{"lat":51.25505,"lng":9.51733},{"lat":51.24803,"lng":9.5154}]}]'::jsonb,
  '{"laenge":30,"breite":3.5,"hoehe":4.5,"gesamtgewicht":120,"achsen":8,"achslasten":[15,15,15,15,15,15,15,15]}'::jsonb,
  jsonb_build_object('von', CURRENT_DATE::text || 'T06:00', 'bis', (CURRENT_DATE + 30)::text || 'T22:00'),
  'mxk@setreo.de'
FROM tenants t
WHERE t.slug = 'setreo'
  AND NOT EXISTS (
    SELECT 1 FROM projects p WHERE p.tenant_id = t.id AND p.name = 'Demo Schwertransport A7 (Hamburg -> Kassel)'
  );
