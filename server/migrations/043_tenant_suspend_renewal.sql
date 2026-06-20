-- T-346: Mandanten-Suspend (administratives Stilllegen ohne Datenverlust). NULL = aktiv,
-- gesetzt = ausgesetzt (timestamptz statt boolean → man sieht WANN). Gate in requireTenant.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- T-347: Idempotenz-Marke für die proaktive Ablauf-Erinnerung. Speichert das valid_until,
-- für das zuletzt erinnert wurde → ein Reminder je Ablaufzyklus; bei Verlängerung zurückgesetzt.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS renewal_notified_for date;
