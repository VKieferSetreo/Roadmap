# Changelog — Setreo Roadmap

Umgekehrt chronologisch, Versionen nach SemVer (MAJOR.MINOR.PATCH). Die API-Version
(`server/package.json`) ist die Single Source, erscheint in den Einstellungen unter
„Datenquelle" und sollte bei jedem Release im News-Feed gepostet werden.

## [3.1.0] — 2026-06-18 — Go-to-Commercialize

Mandanten über ein Lizenzmodell mit Seats verkaufbar. End-to-end live.

### Hinzugefügt
- **Self-Service-Lizenzmodell:** Selbstregistrierung + E-Mail-Verification + Passwort-Reset
  (setreo-auth-extern), Seat-Codes (ein Code = ein Seat), Einlösung mit Mandanten-Zuordnung.
- **Backoffice /mandanten:** Lizenz (Plan/Seats/Laufzeit) setzen, Seat-Codes generieren,
  Belegung sehen; Seat-Limit beim Member-Add.
- **Kunden-Lizenzanzeige** in den Einstellungen (Plan, Laufzeit, Ablauf-Warnung, Seats).
- **Haftungsausschluss** beim Erst-Login (pro Person, versioniert) + in den Einstellungen
  erneut öffenbar.
- **News-Feed** (über Einstellungen): neue Datenquellen / Versionen / Hinweise.
- **Per-Mandant-URL:** `setreo-cloud.com/roadmap/<slug>`.
- **Mandanten-Audit-Log** (wer hat wann was geändert).
- Saubere Admin-Subpages `/mandanten` und `/debugging`.

### Geändert
- Worker 2-Instanz-sicher (pg-Advisory-Lock pro Connector).
- API-Version single-sourced aus `package.json`.

### Sicherheit
- Klartext-Passwörter entfernt (DSGVO) — Passwörter nur noch gehasht in setreo-auth-extern.
- Proxy setzt `X-Forwarded-For` auf die echte Client-IP (Schutz der Rate-Limits).
- Cross-Tenant-Isolations-Negativtests.

### Datenbank
- Migrationen 031 (Lizenz/Seats/Disclaimer), 032 (News), 033 (Klartext-PW raus),
  034 (Audit-Log).

## [3.0.0] — Basis

Plattform-Basis: Multi-Strecken-Projekte, zentrale Hindernis-Datenbank, Auswertungs-Engine,
Karte, Share-Viewer, 50+ Connectoren (Bund/Länder/Städte/Mobilithek), Analytics.
