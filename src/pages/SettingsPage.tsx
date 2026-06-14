// Einstellungen — Datenquelle, Anmeldung, Passwort, Kartendarstellung, Demo-Daten.

import { useEffect, useState } from "react"
import { Database, FlaskConical, KeyRound, LogOut, Mail } from "lucide-react"
import { toast } from "sonner"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input, Label } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Switch } from "@/components/ui/Switch"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { api } from "@/api/roadmap"
import { TILE_LAYERS, useSettingsStore, type TileStyle } from "@/store/settings"
import { useProjectStore } from "@/store/projects"
import { useAuthStore } from "@/store/auth"
import { useContextStore } from "@/store/context"
import { useDataSourceStore } from "@/store/datasource"
import { handleLogout } from "@/lib/auth"

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

/** E-Mail-Benachrichtigungen bei neuen/geänderten Funden auf den eigenen Strecken. */
function MailNotificationCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [available, setAvailable] = useState(true)

  useEffect(() => {
    let active = true
    api.notifications
      .mailPref()
      .then((v) => active && setEnabled(v))
      .catch(() => active && setAvailable(false)) // kein Mandant o.ä. → Karte ausblenden
    return () => {
      active = false
    }
  }, [])

  const toggle = async (next: boolean) => {
    const prev = enabled
    setEnabled(next) // optimistisch
    try {
      await api.notifications.setMailPref(next)
      toast.success(next ? "E-Mail-Benachrichtigungen aktiviert." : "E-Mail-Benachrichtigungen deaktiviert.")
    } catch {
      setEnabled(prev ?? null)
      toast.error("Einstellung konnte nicht gespeichert werden.")
    }
  }

  if (!available || enabled === null) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-neutral-400" />
          Benachrichtigungen
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-800">E-Mail bei neuen Funden</p>
          <p className="text-xs text-neutral-500">
            Wir schicken Ihnen eine E-Mail, wenn auf einer Ihrer ausgewerteten Strecken ein neuer
            Fund auftaucht, sich etwas ändert oder ein Fund entfällt.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={(v) => void toggle(v)} ariaLabel="E-Mail-Benachrichtigungen" />
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const { tileStyle, autoFit, setTileStyle, setAutoFit } = useSettingsStore()
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
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                      Live-Datenbank verbunden
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-600" />
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Projekte, Analysen und die Hindernis-Datenbank laufen über das Roadmap-Backend
                      {apiVersion ? ` (v${apiVersion})` : ""}. Analysen matchen den
                      Strecken-Korridor gegen die zentrale Hindernis-Datenbank.
                    </p>
                  </div>
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
                {identity.roles.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-neutral-500">Freigeschaltete Tools</p>
                    <div className="flex flex-wrap gap-1.5">
                      {identity.roles.map((r) => (
                        <Badge key={r} variant="muted" size="sm">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
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

          {/* Karte */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Karte</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <Label htmlFor="tile">Kartenstil</Label>
                <Select
                  id="tile"
                  value={tileStyle}
                  onChange={(e) => setTileStyle(e.target.value as TileStyle)}
                >
                  {Object.entries(TILE_LAYERS).map(([key, t]) => (
                    <option key={key} value={key}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-800">
                    Strecke automatisch einpassen
                  </p>
                  <p className="text-xs text-neutral-500">
                    Kartenausschnitt beim Öffnen auf die gesamte Route zoomen.
                  </p>
                </div>
                <Switch checked={autoFit} onCheckedChange={setAutoFit} ariaLabel="Auto-Einpassen" />
              </div>
            </CardContent>
          </Card>

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
