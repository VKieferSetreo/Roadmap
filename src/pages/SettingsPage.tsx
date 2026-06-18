// Einstellungen — Datenquelle, Anmeldung, Passwort, Kartendarstellung, Demo-Daten.

import { useEffect, useState } from "react"
import { Database, FlaskConical, KeyRound, LogOut, Mail, Signal } from "lucide-react"
import { toast } from "sonner"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input, Label } from "@/components/ui/Input"
import { Switch } from "@/components/ui/Switch"
import { Button } from "@/components/ui/Button"
import { api } from "@/api/roadmap"
import { SEVERITY_META } from "@/components/project/findingMeta"
import { useProjectStore } from "@/store/projects"
import { useAuthStore } from "@/store/auth"
import { useContextStore } from "@/store/context"
import { useDataSourceStore } from "@/store/datasource"
import { handleLogout } from "@/lib/auth"
import { cn } from "@/lib/cn"
import type { FindingSeverity, MailPref } from "@/types/domain"

const MIN_PW_LEN = 10

/** Eigenes Passwort ändern — nur für externe Kunden-Accounts (setreo-auth-extern). */
function ChangePasswordCard() {
  const [pw, setPw] = useState("")
  const [pw2, setPw2] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (pw.length < MIN_PW_LEN) {
      toast.error(`Passwort muss mindestens ${MIN_PW_LEN} Zeichen haben.`)
      return
    }
    if (pw !== pw2) {
      toast.error("Die Passwörter stimmen nicht überein.")
      return
    }
    setBusy(true)
    try {
      await api.account.changePassword(pw)
      setPw("")
      setPw2("")
      toast.success("Passwort geändert.")
    } catch {
      toast.error("Passwort konnte nicht geändert werden.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-neutral-400" />
          Passwort ändern
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="pw-new">Neues Passwort</Label>
            <Input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={`mindestens ${MIN_PW_LEN} Zeichen`}
            />
          </div>
          <div>
            <Label htmlFor="pw-confirm">Wiederholen</Label>
            <Input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Neues Passwort bestätigen"
            />
          </div>
        </div>
        <div>
          <Button onClick={() => void submit()} disabled={busy || !pw || !pw2}>
            {busy ? "Wird gespeichert …" : "Passwort speichern"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

const MAIL_SEVS: { key: FindingSeverity; label: string }[] = [
  { key: "kritisch", label: "Kritisch" },
  { key: "warnung", label: "Warnung" },
  { key: "hinweis", label: "Hinweis" },
]

/** E-Mail-Benachrichtigungen: an/aus + nach welcher Kritikalität + für welche Projekte. */
function MailNotificationCard() {
  const [pref, setPref] = useState<MailPref | null>(null)
  const [available, setAvailable] = useState(true)

  useEffect(() => {
    let active = true
    api.notifications
      .mailPref()
      .then((p) => active && setPref(p))
      .catch(() => active && setAvailable(false)) // kein Mandant o.ä. → Karte ausblenden
    return () => {
      active = false
    }
  }, [])

  const save = async (next: MailPref) => {
    const prev = pref
    setPref(next) // optimistisch
    try {
      await api.notifications.setMailPref(next)
    } catch {
      setPref(prev)
      toast.error("Einstellung konnte nicht gespeichert werden.")
    }
  }

  if (!available || !pref) return null
  const toggleSev = (s: FindingSeverity) =>
    void save({
      ...pref,
      severities: pref.severities.includes(s)
        ? pref.severities.filter((x) => x !== s)
        : [...pref.severities, s],
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-neutral-400" />
          Benachrichtigungen
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-800">E-Mail bei neuen Funden</p>
            <p className="text-xs text-neutral-500">
              E-Mail, wenn auf einer ausgewerteten Strecke ein Fund neu auftaucht, sich ändert oder entfällt.
            </p>
          </div>
          <Switch
            checked={pref.enabled}
            onCheckedChange={(v) => void save({ ...pref, enabled: v })}
            ariaLabel="E-Mail-Benachrichtigungen"
          />
        </div>

        {pref.enabled ? (
          <>
            <div className="border-t border-neutral-100 pt-3">
              <p className="mb-2 text-xs font-medium text-neutral-500">Bei welcher Kritikalität</p>
              <div className="flex flex-wrap gap-2">
                {MAIL_SEVS.map((s) => {
                  const on = pref.severities.includes(s.key)
                  return (
                    <label
                      key={s.key}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                        on ? SEVERITY_META[s.key].soft : "border-neutral-200 bg-neutral-50 text-neutral-400",
                      )}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleSev(s.key)} className="h-4 w-4 accent-primary-600" />
                      {s.label}
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="border-t border-neutral-100 pt-3">
              <p className="mb-2 text-xs font-medium text-neutral-500">Für welche Projekte</p>
              <div className="flex flex-col gap-1.5">
                {([
                  ["eigene", "Nur meine eigenen Projekte"],
                  ["alle", "Alle Projekte des Mandanten"],
                ] as const).map(([val, label]) => (
                  <label key={val} className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="radio"
                      name="mail-scope"
                      checked={pref.scope === val}
                      onChange={() => void save({ ...pref, scope: val })}
                      className="h-4 w-4 accent-primary-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** Pingt unsere eigene Datenbank/Backend (Health) — erreichbar? Wie schnell? */
function DbPingButton() {
  const [state, setState] = useState<{ loading?: boolean; ms?: number; ok?: boolean } | null>(null)
  const ping = async () => {
    setState({ loading: true })
    const t0 = performance.now()
    try {
      const h = await api.health()
      setState({ ok: h.db === true, ms: Math.round(performance.now() - t0) })
    } catch {
      setState({ ok: false, ms: Math.round(performance.now() - t0) })
    }
  }
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={() => void ping()} disabled={state?.loading}>
        <Signal className={cn("h-3.5 w-3.5", state?.loading && "animate-pulse")} />
        {state?.loading ? "Prüfe …" : "Datenbank anpingen"}
      </Button>
      {state && !state.loading ? (
        <span className={cn("text-xs tabular-nums", state.ok ? "text-severity-hinweis-strong" : "text-severity-kritisch")}>
          {state.ok ? `erreichbar · ${state.ms} ms` : "nicht erreichbar"}
        </span>
      ) : null}
    </div>
  )
}

export function SettingsPage() {
  const resetToSeed = useProjectStore((s) => s.resetToSeed)
  const identity = useAuthStore((s) => s.identity)
  const extern = useContextStore((s) => s.extern)
  const mode = useDataSourceStore((s) => s.mode)
  const apiVersion = useDataSourceStore((s) => s.apiVersion)

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer
        title="Einstellungen"
        description="Datenquelle, Profil und Darstellung der Anwendung."
        width="narrow"
      >
        <div className="flex flex-col gap-5">
          {/* Datenquelle — Live-Backend vs. Demo-Modus */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datenquelle</CardTitle>
            </CardHeader>
            <CardContent className="flex items-start gap-3">
              {mode === "live" ? (
                <>
                  <span className="mt-0.5 rounded-lg bg-primary-50 p-2 text-primary-700">
                    <Database className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                      Live-Datenbank verbunden
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-600" />
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Version {apiVersion ? `v${apiVersion}` : "—"}
                    </p>
                  </div>
                  <DbPingButton />
                </>
              ) : (
                <>
                  <span className="mt-0.5 rounded-lg bg-accent-100 p-2 text-accent-700">
                    <FlaskConical className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Demo-Modus (lokal)</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Kein Backend erreichbar — Projekte werden lokal gespeichert, Auswertungen
                      simuliert. Sobald das Backend verfügbar ist, verbindet sich die App beim
                      nächsten Laden automatisch.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          {/* SSO-Konto — echte Anmelde-Identität vom Setreo-Hub (read-only). */}
          {identity ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Anmeldung</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div>
                  <p className="text-xs text-neutral-500">Angemeldet als</p>
                  <p className="text-sm font-medium text-neutral-900">{identity.email}</p>
                </div>
                <div>
                  <Button variant="outline" onClick={handleLogout}>
                    <LogOut className="mr-1.5 h-4 w-4" />
                    Abmelden
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* E-Mail-Benachrichtigungen (Opt-out) — nur live + mit Mandant. */}
          {mode === "live" ? <MailNotificationCard /> : null}

          {/* Passwort ändern — nur externe Kunden-Accounts. Interne Setreo-Konten
              verwalten ihr Passwort im Setreo-Hub, nicht hier. */}
          {extern ? <ChangePasswordCard /> : null}

          {/* Demo-Daten — nur relevant ohne Backend */}
          {mode !== "live" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daten</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-800">Demo-Daten zurücksetzen</p>
                  <p className="text-xs text-neutral-500">
                    Ersetzt alle lokalen Projekte durch die Beispieldaten.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    resetToSeed()
                    toast.success("Demo-Daten zurückgesetzt.")
                  }}
                >
                  Zurücksetzen
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </PageContainer>
    </div>
  )
}
