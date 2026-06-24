-- White-Label-Branding je Mandant: eine Akzentfarbe (Hex), Anzeigename (Tab-Titel),
-- Logo (Data-URL, klein gehalten — reitet im /api/context-Payload). Alles optional;
-- null = Setreo-Standard. Shape: { accent: "#rrggbb", appName: "...", logo: "data:image/..." }
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS branding jsonb;
