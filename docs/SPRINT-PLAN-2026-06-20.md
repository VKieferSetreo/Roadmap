# Roadmap — Sprint-Plan (Go-Live-Readiness)

**Stand:** 2026-06-20 · **Quelle:** 4 Audits (Security/DSGVO, UX, Data-Quality/OPEX, Scalability/Sellability) + Infra
**Methodik:** 11 Themen-Analysten über 289 offene Tickets → Synthese → 2 adversariale Kritiker (Dependency + Go-Live) → Korrektur · Dach-Ticket T-493
**Kapazität:** Solo (Max + Claude), Deploy via Coolify, **Single-Server bleibt** (Max-Entscheid 2026-06-20)

## Leitlogik — 4 Tore

1. **Existenziell / nicht verkaufbar** → Backups, P0-Security, Gratis-Bezug, Pipeline-Crash (S1)
2. **Produkt-Korrektheit / Haftung** → keine falsche Routen-Freigabe (S2)
3. **Tragfähigkeit unter Last + Verkaufbarkeit** → Stabilität, Seats, Lizenz, Legal/Pricing (S3–S6)
4. **Politur / Skalierungs-Reife / Aufräumen** → Copy, A11y, Bundle, Retention, Connector-Feldtreue (S7–S8)

---

## Sprint 1 — Go-Live-Riegel: nicht verkaufbar / nicht offline / nicht gratis
**Ziel:** Existenzielle + trivial-katastrophale Blocker schließen, ohne die kein zahlender Kunde an die Plattform darf.
**Tickets:** T-446 · T-291 · T-293 · T-292 · T-304 · T-309 · T-352 · T-418 · T-317 · T-303 · T-305 · T-323 · T-376 · T-364 · T-365 · T-477
*(T-355 = Duplikat von T-309 → mit dem Sync-Gate schließen, nicht separat bauen)*

- **T-446** DB-Backups für roadmap-db **und** auth-extern-db: Coolify-Local-Schedule (täglich) aktivieren + beide in den täglichen Server-Pull `backup_all_dbs.sh` aufnehmen (Setreo-IT zieht den für die interne KI restorebar) + **ein Restore-Drill**. *Kein externer S3-Bucket (Max-Entscheid 2026-06-20, „reicht erst mal so"). Ohne Failover (Single-Server) ist das die einzige Datenschutz-Schicht — höchste Priorität.*
- **T-291** safeHref-Allowlist an 5 href/src-Sinks + Screenshot-Regex raster-only → Stored-XSS/Admin-Takeover zu
- **T-293** pw_plain-Spalte droppen (DB, Admin-API, Hub-FE, Backup-Dump)
- **T-292** Art.13-Hinweis am Terminfinder + falsches „DSGVO-konform"-Badge entfernen
- **T-304/T-309** Datenrouten (`/api/obstacles`, `/api/sync`, …) hinter `requireTenant`/`requireRole` → No-Seat-Vollzugriff zu
- **T-352/T-418** max_seats im Redeem prüfen · **T-317** abgelaufene Lizenz ≠ Vollzugriff
- **T-303 + T-305/T-323/T-376** Cron-Herd entschärfen: Schedules staffeln/Queue **+ ein gemeinsamer `unhandledRejection`-Guard** · **T-364** Overlap-Schutz
- **T-365** croner mit `{timezone:'Europe/Berlin'}`-**Option** (nicht Container-TZ!) — koordiniert mit T-465/S2
- **T-477** Zero-Admin-Bootstrap (one-line in Redeem-tx) — schaltet Self-Service frei

**Exit:** Backups + Restore-Drill grün · XSS im Share-Viewer nicht reproduzierbar · pw_plain weg · Art.13 live · No-Seat-Extern bekommt 403 · Redeem über Limit/abgelaufen abgelehnt · Worker überlebt vollen Import-Tick, Schedules gestaffelt.
**⚠ Bekannte Restlücke:** Seat-Limit ist nach S1 nur im **Redeem-Pfad** durchgesetzt; der Admin-Provision-Pfad (T-348/349/341) wird erst in **S3** dicht — bewusst akzeptiert.

## Sprint 2 — Produkt-Korrektheit: keine falsche Routen-Freigabe
**Ziel:** Daten-Defekte schließen, die eine Schwertransport-Route fälschlich als frei zeigen.
**Tickets:** T-311 · T-314 · T-427 · T-429 · T-431 · T-443 · **T-265** · T-253 · T-284 · T-266 · T-267 · T-428 · T-432 · T-465 · T-472
*(T-451 = Duplikat von T-265 → **Engine-Fix T-265 wählen**, T-451 als Dup schließen)*

- **T-311/T-314** Reconcile bei Teil-/Timeout-Feed unterbinden (`result.complete`-Flag) → kein „Hindernis entfallen"-Churn
- **T-427** Autobahn `services/warning` holen · **T-429** DATEX2 Höhe/Gewicht/Breite (größter Hebel) · **T-431** 5 geom-lose Connectoren · **T-443** Sachsen LKW-Sperre
- **T-265** Vollsperrung → kritisch (Engine) · **T-428/T-432** Falsch-Positive (WEIGHT_LIMIT_35, Einzelspur)
- **T-253** Tonnage-Fehlextraktion an Kontext-Keywords binden — **direkt fixen, NICHT auf T-284 warten** (False-Dep; T-284 ist toter-Code-Cleanup, jederzeit)
- **T-266/T-267** extrahierte attrs ohne Plausi / Transport-Zeitraum-Degradierung
- **T-465** Datums-Off-by-one: Container `TZ=UTC` pinnen + `pg.types.setTypeParser(1082, raw)` — koordiniert mit T-365/S1
- **T-472** Sync-Toast: „N neu / M nicht erreichbar" statt pauschalem Erfolg

**Exit:** Teil-Feed überspringt Reconcile nachweislich · Autobahn/DATEX-Limits erscheinen als Funde · 5 Connectoren liefern Linien · Vollsperrungen kritisch · Testprojekt zeigt korrekte Gewichts-/Höhenlimits · Datumsfelder korrekt.

## Sprint 3 — Seat-Lifecycle & Gateway-Trust dicht machen
**Ziel:** Pro-Seat-Modell technisch durchsetzbar — ein bezahlter Code = genau ein Seat, entlassene Nutzer raus.
**Tickets:** T-350 · T-319 · T-423 · T-348 · T-349 · T-341 · T-318 · T-353 · T-351 · T-320 · T-356 · T-357 · T-354 · T-358 · T-422

- **Seat-Race-Cluster als EIN Tx-Pass** (seatCodes.js + adminTenants.js, `FOR UPDATE` auf tenants-Zeile): T-350 (Wurzel) → T-319/T-423 (Doppeleinlösung) → T-348/T-349 (Limit-TOCTOU im members-Pfad) → T-341 (tenant_members ohne Tx)
- **T-318/T-353** (= ein Fix) Seat-Slot bei Member-Remove freigeben · **T-320** Offboarding sperrt Login
- **T-351/T-422** Rate-Limit + Audit-Log **nach** den Race-Fixes
- **Proxy/Ingress** (mit S4-SEC am selben Caddyfile koordinieren): T-356 → T-357 (zweite öffentliche Route zu, dann X-Gateway-Secret) · T-354 internes Redeem von außen zu
- **T-358** Admin-PW-Reset (FE-Feld, Helpdesk-Entlaster)

**Exit:** Paralleler Redeem mit zwei Mails → genau ein Member (zweiter 409) · Limit unter Last nicht überschreitbar · entfernte Member geben Seat frei · entlassener Nutzer sofort ausgeloggt · roadmap-api nicht mehr am Gateway vorbei erreichbar.

## Sprint 4 — Tragfähigkeit unter Last: Stabilität, OOM-Riegel, Auth/Proxy
**Ziel:** Die einzige API-Replica gegen Selbst-DoS/OOM absichern, Observability-Fundament, XFF-Spoofing schließen.
**Tickets:** T-470 · T-397 · T-389 · **T-163(DSN-Anteil)** · T-468 · T-469 · T-471 · **+ ENV: Docker-mem-limit + NODE_OPTIONS** · T-312 · T-336 · T-343 · T-337 · T-308 · T-326 · T-335 · T-297 · T-298 · T-296 · T-464 · **T-225** · T-466 · T-467

- **T-470** `pool.on('error')` + Prozess-Guards · **T-397/T-389** Server-Timeout + SIGTERM-Drain
- **T-163 (DSN-Anteil vorgezogen)** Sentry-Instanz + DSN als Coolify-ENV + Heartbeat-Sink — **muss vor T-468/T-469 stehen** (sonst Exit unerfüllbar). Rest von T-163 (Usage/Alert-Routing) bleibt S8.
- **ENV-Task (neu):** `mem_limit` + `NODE_OPTIONS=--max-old-space-size` für roadmap-api — **Voraussetzung**, damit die OOM-Fixes greifen (heute mem=0)
- **T-468/T-469/T-471** Sentry+Request-ID · Worker-Dead-Man's-Switch · Health prüft OSRM
- **OOM-Block:** T-312 (geom 35 MB ×3) · T-336/T-343 (ungated /obstacles, /projects) · T-337 (Default-Limiter) · T-308 (partialize schlank) · T-326 (Quota-Wrapper) · T-335 (Share-Limiter per-Client)
- **Auth/Proxy-Sweep:** T-297 → T-298 (XFF-Spoofing-Root-Cause) · T-296 (starlette-CVE) — am selben Layer wie S3-Proxy
- **T-464 + T-225** Cross-Tenant-Sync: Backend-Gate **und** FE-Button (`!extern/isAdmin`) zusammen → externer Kunde sieht den Global-Sync-Button gar nicht erst
- **T-466/T-467** Lost-Update / Concurrent-Analysis (Team-Kollaboration)

**Exit:** DB-Restart crasht weder API noch Worker · Sentry empfängt Fehler mit Request-ID · /obstacles+/projects gated + bbox-begrenzt, paralleler Map-Load kippt Replica nicht · XFF nur aus Caddy-CIDR · externer Kunde kann keinen All-Tenant-Sync auslösen · parallele Edits → 409.

## Sprint 5 — Frontend-Wahrheitstreue: Zahlen, Artefakte, Demo-Modus
**Ziel:** Frontend ehrlich machen — Status-Maschine, Kennzahlen, PDF/Share-Artefakt, getarnte Fehler, Demo-Modus.
**Tickets:** T-220 · T-230 · T-227 · **T-462** · T-219 · T-222 · T-226 · T-228 · T-231 · T-447 · T-448 · **T-224** · T-223 · T-221 · T-245 · T-233 · T-234 · T-480 · T-479 · T-490

- **Fundament zuerst:** T-220 (Boot-Reconciler heilt Analyse-Hänger, Overlay statt Empty-Flash) · T-230 (3 Store-Lecks, mandanten-gescopter persist-Key) · **T-227+T-462** (ein katMeta()-Crash-Guard über StreckenBand/ReportView/PDF)
- **Wahrheitstreue:** T-219 (Counts aus gefiltertem Set) · T-222 (Warnhinweis bei fehlender Höhe/Gewicht) · T-226 (routeId-lose Funde im PDF) · T-228 (Empty-vs-Error trennen)
- **Demo/Chat (Max-Feedback):**
  - T-231/T-447 Demo-Banner app-weit + stiller Demo-Fallback → ErrorState statt erfundene Funde
  - **T-448** App-Chat-Default = **internal**; der **Öffentlich-Scope bleibt als gewollte Community-Funktion** (über Setreo-Kunden)
  - **T-224** Externer **Share-Link trägt KEINEN Chat** — `detect()` aufrufen/`shareMode` + Chat-Button hart ausblenden (Prop durch KarteTab→RouteMap→FindingMarker), gegen frisch gebauten `server/public/share`-Artefakt verifizieren
- **T-223** Share-Payload um Transport-Masse · **T-221** AUTH_FAILURE-Listener · **T-245** Seat-Code-Normalisierung · **T-233/T-234** Teil-Sync-/Mutationsfehler surfacen · **T-480** OSRM-Fallback-Route als „grob" kennzeichnen · **T-479/T-490** Error-/Retry-State, Share-unlock try/catch

**Exit:** Reload während Analyse friert nichts ein · Donut/Counts spiegeln Filter · Warnhinweis ohne Höhe/Gewicht · Demo app-weit gebannert, kein unmarkiertes Seeding · App-Chat default intern, **Share-URL ohne Chat** · korrekt formatierter Seat-Code akzeptiert.

## Sprint 6 — Verkaufbar machen: Legal, Pricing, DSGVO-Mechanik, Mail
**Ziel:** Kommerzielle + rechtliche Verkaufsschicht vervollständigen.
**Tickets:** T-166 · T-160 · **T-300(Export+Erasure)** · T-315 · T-316 · T-414 · T-415 · T-346 · T-347 · T-416 · T-395 · T-474 · T-473 · T-475 · T-486 · T-485 · T-488

- **T-166** Pricing-Tiers/Limits (Business-Decision, kein Code) **zuerst** — speist AVV/Datenschutzerklärung + Seat-Parameter
- **T-160** DSGVO-Paket (Datenschutzerklärung + AVV + Impressum + Export Art.15 / Löschung Art.17)
- **T-300** **nur Export (Art.15/20) + Erasure (Art.17)** hier; der **Retention/TTL-Anteil wandert nach S8** (braucht den täglichen Cron aus T-368..373)
- **T-315/T-416** protokollierter AGB-/DPA-Akzept (B2B-Procurement) · **T-316** DE-Fehlerkontrakt `{code,message}`
- **T-414/T-415** Tenant-Vollexport + Self-Service-Löschung · **T-346/T-347** Suspend vor Renewal (Lizenz-Lifecycle)
- **Mail-Pipeline:** T-395 (DKIM-Absender) · T-474 (doppelte Worker-Env) → T-475 (Konfig dok.) · T-473 (DE-Datum) · T-486 (Fehler an Sentry, nach Konfig-Bereinigung) · T-485 (Notify-Default) · T-488 (Registration-Default)

**Exit:** Pricing festgelegt + in Legal-Docs referenziert · Datenschutzerklärung/AVV/Impressum live · Mandant exportier-/löschbar · AGB-Akzept mit Version+Timestamp · API-Fehler auf Deutsch · Suspend/Renewal · Onboarding-/Reset-Mails mit DKIM + korrektem Datum.

## Sprint 7 — Concurrency-Korrektheit, Deploy-Härtung, Connector-Display
**Ziel:** Transaktions-/Concurrency-Korrektheit abschließen, Deploy-Skew härten, strukturierte Connector-Felder bis ins PDF/CSV durchreichen.
*(T-449 Cloud-Migration **gestrichen** — Single-Server bleibt, Max-Entscheid. SPOF = akzeptiertes Risiko, T-446-Backups sind die Mitigation.)*
**Tickets:** T-321 · T-338 · T-322 · T-374 · T-333 · T-342 · T-339 · T-340 · T-306 · T-328 · T-459 · T-289 · T-441 · T-450 · T-458 · T-442 · T-444

- **Quick-Wins:** T-321 (no-cache index.html → kein Weißbildschirm nach Deploy) · T-338 (Nominatim-Public-Fallback raus)
- **Deploy/Migrate-Robustheit:** T-322/T-374 (Deploy-Skew, Expand-Contract) · T-306/T-328 (Migrate-Robustheit — jetzt backup-gesichert)
- **Lock/Pool-Korrektheit:** T-333/T-342 (= ein Fix, XACT-Lock auf dedizierte Session-Connection) · T-339/T-340 (Mailjet-Timeout-Leak unter Lock)
- **Connector-Display:** **T-459** reicht attrs bis PDF/CSV durch (+ Test T-289) — **Voraussetzung**, dass die Feldtreue-Fixes sichtbar werden · T-441 (BW-BEMaS direction-Enum) · T-450 (Köln Layer 1+2) · T-458 (Leipzig Achslast/Länge) · T-442/T-444 (Dedup/Struktur)

**Exit:** Kein Weißbildschirm nach Deploy · /geocode ohne OSM-Public · FE↔API-Skew sichtbar · XACT-Lock blockiert keinen Pool-Slot über volle Rerun-Dauer · attrs erscheinen in Popup/PDF/CSV · BW/Köln/Leipzig korrekt.

## Sprint 8 — Politur, Skalierungs-Reife, Aufräumen
**Ziel:** Marke/Vertrauen nach außen, N+1-Writes + Retention bändigen, Bundle optimieren, Board sauber schließen.
**Tickets:** T-239 · T-237 · T-240 · T-235 · T-236 · T-238 · T-241 · T-242 · T-243 · T-329 · T-330 · T-331 · T-368 · T-369 · T-370 · T-371 · T-372 · T-373 · **T-300(Retention-Anteil)** · T-362 · T-360 · T-361 · T-359 · T-363 · T-412 · T-413 · T-163(Rest) · T-345 · T-481 · T-492 · T-482 · T-476 · T-433 · T-434 · T-435 · T-436 · T-440 · T-445 · T-452 · T-453 · T-454 · T-197 · T-217 · T-214 · T-216

- **Marke/Vertrauen:** T-239 (Positiv-Leerzustand „Keine Hindernisse") · T-237 (Copy-Glossar-Pass **spät** — berührt fast jede Datei) · T-240/T-235/T-236/T-238 (Affordance/Confirm/Token)
- **A11y:** T-241/T-242/T-243 (Roving/Fokus) — Qualität, nicht go-live-kritisch
- **N+1-Writes:** T-329 → T-330 → T-331 (Batch-INSERT) · **Retention-Familie** T-368..373 + **T-300-Retention-Anteil** (gemeinsamer täglicher Cron + Indizes)
- **Bundle:** T-362 (manualChunks) → T-360/T-361 (Route-/Map-Lazy) → T-359/T-363/T-412/T-413 (tote Deps, native crypto, Fonts self-host) · **T-345** Minimal-CI (gegen Bus-Faktor 1)
- **Daten-Ehrlichkeit:** T-481 → T-492 (aktualisiertAm je Fund → Bericht-Kopf) · T-482/T-476 (Heatmap-SSoT, Staleness)
- **Restliche Connector-Feldtreue:** T-433..454 (batchbar)
- **Board schließen:** T-197/T-217 nach 5-Min-UAT → done · Audit-Dächer T-214/T-216 schließen (nachdem Kinder eingeplant)

**Exit:** Null-Funde → grüner Positiv-Befund · Copy Sie-Form/ohne Emojis · A11y · Batch-Writes · täglicher Retention-Cron · stabile Vendor-Chunks, tote Deps raus · CI-Gate läuft · Bericht trennt Berichtsdatum/Daten-Stand · Board ohne falsch-offene Stränge.

---

## Bewusst zurückgestellt (Deferred)
- **T-449** Cloud-Migration — **Single-Server bleibt** (Max 2026-06-20). SPOF akzeptiert, durch T-446-Backups mitigiert.
- **T-251** Cross-Tenant-Chat-Architektur — **entschieden:** Öffentlich-Scope bleibt gewollte Funktion, Default internal (T-448), Share-URL ohne Chat (T-224). Kein offener Blocker mehr.
- **T-244** Responsive/Mobile — erst Zielplattform-Entscheidung (L, nicht go-live-kritisch)
- **T-189** Admin-/Debug-Slider-Nav — leere Description, braucht 30-Min-Scoping
- **T-162/T-178** stateless API / Auswertungs-Queue — YAGNI bis 2. API-Instanz · **T-388/T-390** PgBouncer/Multi-Replica — entfällt, da Single-Server
- **T-301/T-302** Security-Sammeltickets (12 Med / 13 Low) — einzeln nach Go-Live nach Hebel
- **T-201/T-203** Domain-Reputation/SmartScreen — extern-abhängig, kein Code-Task, parallel
- **T-179/T-200** XL/L Enrichment-Tiefe — kein Go-Live-Bezug
- **P3-Feldtreue + UX/PERF-Feintuning** (T-258.., T-437.., T-246.., T-377..) — Batch-Welle nach Go-Live

## Risiken
- **Single-Server-SPOF akzeptiert** → Hardware/Strom/Netz-Ausfall = alle Setreo-Dienste offline, kein Failover. Einzige Mitigation: T-446-Backups + Restore-Drill (S1) müssen wasserdicht sein.
- **Solo-Kapazität:** S1–S2 sind dicht an P0/Blocker. Mitigation: S-lastige Quick-Win-Bündel (Crash-Guard-Trio, Schedule-Refactor) zuerst, M-Tickets (T-291/T-293) danach — früher Sicherheitsnutzen auch bei Slip.
- **Caddyfile/auth-extern-Doppelarbeit:** T-297/298/356/357/354 fassen denselben Proxy-Layer an → in S3/S4 bewusst benachbart, in einem Touch ausführen.
- **DSGVO-Export/Erasure breit:** T-300/160/414/415 berühren alle mandantengebundenen Tabellen (inkl. Migration 031 Seat-Daten) → end-to-end über das ganze Schema führen, kann über S6 hinauslaufen.
