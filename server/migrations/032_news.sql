-- 032 — News-Feed: Setreo postet Ankuendigungen (neue Datenquelle, neue Version, Hinweis),
-- alle eingeloggten Nutzer sehen sie. Gelesen-Status wird clientseitig (localStorage) gehalten,
-- daher keine news_reads-Tabelle (YAGNI).

CREATE TABLE IF NOT EXISTS news (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kategorie    text NOT NULL DEFAULT 'hinweis',  -- 'datenquelle' | 'version' | 'hinweis'
  titel        text NOT NULL,
  body         text NOT NULL DEFAULT '',
  created_by   text,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_published_idx ON news (published_at DESC);
