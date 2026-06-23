// Tenant-Admin Self-Service (T-147): ein Mandanten-eigener Admin (tenant_members.role='admin')
// verwaltet hier NUR die Nutzer SEINES Mandanten — hinzufügen/entfernen, Admin-Rechte
// vergeben/teilen, Seats im Lizenzlimit belegen. Lizenz/Plan/Seat-Limit bleiben Setreo-Sache
// (separates /mandanten-Backoffice). Endpoints sind serverseitig tenant-scoped (requireTenantAdminParam).

import { useCallback, useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { toast } from "sonner"
import { Download, Plus, Save, Trash2, Users } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { EmptyState } from "@/components/shared/EmptyState"
import { useContextStore } from "@/store/context"
import { useDataSourceStore } from "@/store/datasource"
import { api } from "@/api/roadmap"
import { ApiError } from "@/api/client"
import type { TenantMember, TenantRole } from "@/types/domain"

const MIN_PW = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Draft {
  email: string
  role: TenantRole
  passwort: string // neuer Nutzer: Pflicht; bestehender mit pwReset: neues Passwort; sonst leer = unverändert
  isNew: boolean
  pwReset: boolean // bestehender Nutzer: Passwort-Reset-Feld eingeblendet (T-358)
  lastSeen?: string | null // T-426: letzter Login (read-only)
}

const toDraft = (m: TenantMember): Draft => ({ email: m.email, role: m.role, passwort: "", isNew: false, pwReset: false, lastSeen: m.lastSeen })

/** Letzter Login menschenlesbar: „heute", „gestern", „vor N Tagen" bzw. Datum; null = „noch nie". */
function lastSeenLabel(iso?: string | null): string {
  if (!iso) return "noch nie"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const tage = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (tage <= 0) return "heute"
  if (tage === 1) return "gestern"
  if (tage < 7) return `vor ${tage} Tagen`
  return d.toLocaleDateString("de-DE")
}

export function TenantUsersPage() {
  const ctxLoaded = useContextStore((s) => s.loaded)
  const isAdmin = useContextStore((s) => s.isAdmin)
  const isTenantAdmin = useContextStore((s) => s.isTenantAdmin)
  const tenant = useContextStore((s) => s.tenant)
  const mode = useDataSourceStore((s) => s.mode)

  const [members, setMembers] = useState<Draft[]>([])
  const [maxSeats, setMaxSeats] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null) // T-491: Lade-Fehler vs. leer trennen
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false) // T-414

  const tenantId = tenant?.id

  const reload = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setLoadError(null)
    try {
      const t = await api.getTenant(tenantId)
      setMembers(t.mitglieder.map(toDraft))
      try {
        const lic = await api.seatCodes(tenantId)
        setMaxSeats(lic.license.maxSeats || 0)
      } catch {
        setMaxSeats(0) // Lizenz nicht lesbar → unbegrenzt anzeigen
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Nutzer konnten nicht geladen werden."
      setLoadError(msg) // T-491: Inline-Fehler statt 'Noch keine Nutzer' (Fehler ≠ leer)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    if (mode === "live" && tenantId) void reload()
    else setLoading(false)
  }, [mode, tenantId, reload])

  // Self-guard: nur Tenant-Admins (globaler Admin nutzt /mandanten). Erst nach Kontext-Load entscheiden.
  if (mode === "live" && !ctxLoaded) {
    return <div className="flex h-full items-center justify-center text-sm text-neutral-400">Lädt …</div>
  }
  if (mode === "live" && !isTenantAdmin && !isAdmin) return <Navigate to="/" replace />

  const setRow = (i: number, patch: Partial<Draft>) =>
    setMembers((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () =>
    setMembers((rows) => [...rows, { email: "", role: "user", passwort: "", isNew: true, pwReset: false }])
  const removeRow = (i: number) => setMembers((rows) => rows.filter((_, idx) => idx !== i))

  const atSeatLimit = maxSeats > 0 && members.length >= maxSeats

  // T-414: DSGVO-Self-Service-Datenexport des eigenen Mandanten (JSON-Download).
  const onExport = async () => {
    setExporting(true)
    try {
      const data = await api.account.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `setreo-export-${tenant?.slug ?? "mandant"}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Datenexport heruntergeladen.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Export fehlgeschlagen.")
    } finally {
      setExporting(false)
    }
  }

  const save = async () => {
    // Client-Validierung (Server prüft erneut + härter)
    const seen = new Set<string>()
    for (const m of members) {
      const email = m.email.trim().toLowerCase()
      if (!EMAIL_RE.test(email)) return toast.error(`Ungültige E-Mail: ${email || "(leer)"}`)
      if (seen.has(email)) return toast.error(`E-Mail doppelt: ${email}`)
      seen.add(email)
      if (m.isNew && m.passwort.length < MIN_PW) {
        return toast.error(`Neuer Nutzer ${email} braucht ein Passwort (≥ ${MIN_PW} Zeichen).`)
      }
      // T-358: bestehender Nutzer mit (nicht-leerem) Reset-Passwort → Mindestlänge prüfen.
      if (!m.isNew && m.passwort && m.passwort.length < MIN_PW) {
        return toast.error(`Neues Passwort für ${email}: mindestens ${MIN_PW} Zeichen.`)
      }
    }
    if (!members.some((m) => m.role === "admin")) {
      return toast.error("Mindestens ein Admin muss erhalten bleiben.")
    }
    if (!tenantId) return
    setSaving(true)
    try {
      const t = await api.saveTenantMembers(
        tenantId,
        members.map((m) => ({ email: m.email.trim().toLowerCase(), role: m.role, password: m.passwort })),
      )
      setMembers(t.mitglieder.map(toDraft))
      toast.success("Nutzer gespeichert.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Speichern fehlgeschlagen.")
    } finally {
      setSaving(false)
    }
  }

  if (mode !== "live") {
    return (
      <PageContainer title="Nutzer verwalten">
        <EmptyState icon={Users} title="Nutzerverwaltung" description="Nur im Live-Betrieb verfügbar." />
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title="Nutzer verwalten"
      description={
        tenant?.name
          ? `Nutzer von ${tenant.name} verwalten: hinzufügen, entfernen, Admin-Rechte vergeben.`
          : "Nutzer Ihres Mandanten verwalten."
      }
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void onExport()} disabled={exporting} title="Alle Daten Ihres Mandanten als JSON exportieren (DSGVO)">
            <Download className="h-4 w-4" /> {exporting ? "Export …" : "Daten-Export"}
          </Button>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-neutral-600">
            {members.length}{maxSeats > 0 ? ` / ${maxSeats}` : ""} Seats
          </span>
        </div>
      }
    >
      <Card>
        <CardContent className="flex flex-col gap-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-neutral-400">Lädt …</div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-neutral-200">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">E-Mail</th>
                      <th className="w-32 px-3 py-2 font-medium">Rolle</th>
                      <th className="w-32 px-3 py-2 font-medium">Letzter Login</th>
                      <th className="w-48 px-3 py-2 font-medium">Passwort</th>
                      <th className="w-12 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {loadError ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center">
                          <p className="text-sm text-red-600">{loadError}</p>
                          <button
                            type="button"
                            onClick={() => void reload()}
                            className="mt-2 text-sm font-medium text-blue-600 hover:underline"
                          >
                            Erneut versuchen
                          </button>
                        </td>
                      </tr>
                    ) : members.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                          Noch keine Nutzer. Unten hinzufügen.
                        </td>
                      </tr>
                    ) : (
                      members.map((m, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">
                            {m.isNew ? (
                              <Input
                                value={m.email}
                                onChange={(e) => setRow(i, { email: e.target.value })}
                                placeholder="name@firma.de"
                                className="h-8"
                              />
                            ) : (
                              <span className="text-neutral-800">{m.email}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={m.role}
                              onChange={(e) => setRow(i, { role: e.target.value as TenantRole })}
                              className="h-8"
                            >
                              <option value="user">Nutzer</option>
                              <option value="admin">Admin</option>
                            </Select>
                          </td>
                          <td className="px-3 py-2 text-xs tabular-nums text-neutral-500" title="Letzter erfasster Login">
                            {m.isNew ? "—" : lastSeenLabel(m.lastSeen)}
                          </td>
                          <td className="px-3 py-2">
                            {m.isNew || m.pwReset ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="text"
                                  value={m.passwort}
                                  onChange={(e) => setRow(i, { passwort: e.target.value })}
                                  placeholder={`≥ ${MIN_PW} Zeichen`}
                                  className="h-8"
                                />
                                {!m.isNew ? (
                                  <button
                                    onClick={() => setRow(i, { pwReset: false, passwort: "" })}
                                    title="Reset abbrechen"
                                    className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-600"
                                  >
                                    abbrechen
                                  </button>
                                ) : null}
                              </div>
                            ) : (
                              <button
                                onClick={() => setRow(i, { pwReset: true })}
                                className="cursor-pointer text-xs font-medium text-primary-600 hover:underline"
                              >
                                Passwort zurücksetzen
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => removeRow(i)}
                              title="Entfernen"
                              aria-label={`${m.email || "Nutzer"} entfernen`}
                              className="cursor-pointer rounded p-1 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-severity-kritisch"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="outline" size="sm" onClick={addRow} disabled={atSeatLimit}>
                  <Plus className="h-4 w-4" /> Nutzer hinzufügen
                </Button>
                {atSeatLimit ? (
                  <span className="text-xs text-neutral-400">
                    Seat-Limit erreicht. Nutzer entfernen oder bei Setreo mehr Seats anfragen.
                  </span>
                ) : null}
                <Button onClick={save} disabled={saving}>
                  <Save className="h-4 w-4" /> {saving ? "Speichert …" : "Speichern"}
                </Button>
              </div>
              <p className="text-xs text-neutral-400">
                Neue Nutzer brauchen ein Passwort (Login über app.setreo-cloud.com). Bei bestehenden
                Nutzern setzt „Passwort zurücksetzen" ein neues Passwort. Rolle „Admin" darf ebenfalls
                Nutzer verwalten. Lizenz/Seat-Anzahl ändert Setreo.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  )
}
