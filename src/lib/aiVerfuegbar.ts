// Ist die Roadmap-AI unter /ai überhaupt aufgeschaltet? (T-664/F3)
//
// Der Menüpunkt wurde bedingungslos gerendert, die Seite hängt ihn als <iframe src="/ai">
// wurzelrelativ ein. Gemessen: setreo-intern.com/ai antwortet mit 302 auf den Login (da läuft
// er), setreo-cloud.com/ai mit 404 und dem Rumpf „Cannot GET /ai". Auf der Kundendomain lud der
// zweite Menüpunkt unter Home also eine Express-Fehlerseite in den Rahmen — auch für einen Admin,
// denn dort gibt es für /ai gar keinen Upstream.
//
// Bewusst eine Laufzeitprüfung statt eines Env-Flags: ein Flag wirkt erst, wenn es in JEDEM
// Deployment gesetzt ist. Bis dahin würde es entweder nichts reparieren (Default an) oder den
// funktionierenden Eintrag auf setreo-intern.com mit abräumen (Default aus). Die Prüfung hier
// stimmt ohne Zutun in beiden Umgebungen und bleibt richtig, wenn eine Domain dazukommt.
//
// Ein 302 auf den Login zählt als vorhanden — deshalb `redirect: "manual"`, das liefert eine
// undurchsichtige Antwort mit Status 0, und nur ein echter 404 gilt als „nicht da". Im Zweifel
// (Netzfehler, offline, alles andere) bleibt der Eintrag stehen: ein fehlender Menüpunkt wäre
// der schlechtere Fehler als einer, der einmal ins Leere führt.
//
// Einmal je Seitenladung, das Ergebnis wird im Modul gehalten.

let geprueft: Promise<boolean> | null = null

export function aiVerfuegbar(): Promise<boolean> {
  geprueft ??= fetch("/ai", { method: "HEAD", redirect: "manual" })
    .then((r) => r.status !== 404)
    .catch(() => true)
  return geprueft
}
