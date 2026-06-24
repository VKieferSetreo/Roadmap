// Mandanten-Verwaltung (nur Setreo-Admin): Mandanten anlegen/umbenennen/löschen.
// Pro Mandant ein-/ausklappbar eine Nutzer-Tabelle: E-Mail · Rolle (Admin/User) ·
// Passwort (Klartext, editierbar) · Entfernen. Zentraler Speichern-Button je Mandant.
// Nutzer werden NUR mit Passwort angelegt (Konto in setreo-auth-extern, Login app.setreo-cloud.com).

import { useCallback, useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FolderKanban,
  ImageOff,
  KeyRound,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  UserX,
  X,
} from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input, Label } from "@/components/ui/Input"
import { EmptyState } from "@/components/shared/EmptyState"
import { useContextStore } from "@/store/context"
import { useDataSourceStore } from "@/store/datasource"
import { api } from "@/api/roadmap"
import { formatDateDE } from "@/lib/format"
import { primaryRampFromHex } from "@/lib/branding"
import type { Branding, SeatCode, Tenant, TenantMember, TenantRole } from "@/types/domain"
import { ApiError } from "@/api/client"

const MIN_PW = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Draft {
  email: string
  role: TenantRole
  passwort: string // Klartext (leer = unverändert/intern)
  isNew: boolean
}

const toDraft = (m: TenantMember): Draft => ({
  email: m.email,
  role: m.role,
  passwort: "", // Klartext wird nicht mehr geladen — leer = unverändert, ausfüllen = neu setzen
  isNew: false,
})

export function AdminTenantsPage() {
  const isAdmin = useContextStore((s) => s.isAdmin)
  const ctxLoaded = useContextStore((s) => s.loaded)
  const tenants = useContextStore((s) => s.tenants)
  const refreshTenants = useContextStore((s) => s.refreshTenants)
  const mode = useDataSourceStore((s) => s.mode)

  const [slug, setSlug] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  if (mode === "demo") {
    return (
      <div className="h-full overflow-y-auto">
        <PageContainer title="Mandanten" description="Mandanten- und Nutzer-Verwaltung." width="narrow">
          <EmptyState
            icon={Building2}
            title="Nur mit Live-Datenbank"
            description="Die Mandanten-Verwaltung braucht das Backend. Im Demo-Modus nicht verfügbar."
          />
        </PageContainer>
      </div>
    )
  }
  if (ctxLoaded && !isAdmin) return <Navigate to="/" replace />

  const create = async () => {
    const s = slug.trim().toLowerCase()
    const n = name.trim()
    if (!/^[a-z0-9-]{2,40}$/.test(s)) {
      toast.error("Kürzel: 2–40 Zeichen, nur a–z, 0–9 und Bindestrich.")
      return
    }
    if (!n) {
      toast.error("Bitte einen Namen angeben.")
      return
    }
    setBusy(true)
    try {
      await api.createTenant(s, n)
      await refreshTenants()
      setSlug("")
      setName("")
      toast.success(`Mandant „${n}" angelegt.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Anlegen fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer
        title="Mandanten"
        description="Kunden-Mandanten + Nutzer verwalten: pro Mandant aufklappen, Rolle und Passwort setzen, zentral speichern."
      >
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Neuen Mandanten anlegen</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="t-name">Name</Label>
                <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Krause Schwertransporte GmbH" />
              </div>
              <div className="sm:w-56">
                <Label htmlFor="t-slug">Kürzel (für Links)</Label>
                <Input id="t-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="z.B. krause" className="font-mono" />
              </div>
              <Button onClick={() => void create()} loading={busy}>
                <Plus className="h-4 w-4" /> Anlegen
              </Button>
            </CardContent>
          </Card>

          {tenants.length === 0 ? (
            <EmptyState icon={Building2} title="Noch keine Mandanten" />
          ) : (
            <div className="flex flex-col gap-3">
              {tenants.map((t) => (
                <TenantTile key={t.id} tenant={t} onChanged={() => void refreshTenants()} />
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </div>
  )
}

function TenantTile({ tenant, onChanged }: { tenant: Tenant; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(tenant.name)
  const [members, setMembers] = useState<Draft[]>(tenant.mitglieder.map(toDraft))
  const [busy, setBusy] = useState(false)

  // Bei externer Änderung (refresh) den Draft neu aus dem Tenant aufbauen.
  useEffect(() => {
    setMembers(tenant.mitglieder.map(toDraft))
    setNameDraft(tenant.name)
  }, [tenant])

  const setRow = (i: number, patch: Partial<Draft>) =>
    setMembers((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const removeRow = (i: number) =>
    setMembers((rows) => {
      // T-235: das Entfernen eines BESTEHENDEN Nutzers deaktiviert beim Speichern dessen Konto +
      // Sessions (Self-Lockout-Risiko) → bestätigen. Neue (noch nicht gespeicherte) Zeilen direkt weg.
      const row = rows[i]
      if (row && !row.isNew && !window.confirm(`Nutzer „${row.email}" aus dem Mandanten entfernen? Der Zugang wird beim Speichern deaktiviert.`)) {
        return rows
      }
      return rows.filter((_, idx) => idx !== i)
    })
  const addRow = () => setMembers((rows) => [...rows, { email: "", role: "user", passwort: "", isNew: true }])

  const save = async () => {
    // Validierung
    const seen = new Set<string>()
    for (const m of members) {
      const email = m.email.trim().toLowerCase()
      if (!EMAIL_RE.test(email)) {
        toast.error(`Ungültige E-Mail: ${email || "(leer)"}`)
        return
      }
      if (seen.has(email)) {
        toast.error(`E-Mail doppelt: ${email}`)
        return
      }
      seen.add(email)
      if (m.isNew && m.passwort.length < MIN_PW) {
        toast.error(`Neuer Nutzer ${email}: Passwort mind. ${MIN_PW} Zeichen.`)
        return
      }
      if (m.passwort && m.passwort.length < MIN_PW) {
        toast.error(`Passwort für ${email}: mind. ${MIN_PW} Zeichen.`)
        return
      }
    }
    setBusy(true)
    try {
      if (nameDraft.trim() && nameDraft.trim() !== tenant.name) {
        await api.renameTenant(tenant.id, nameDraft.trim())
      }
      await api.saveTenantMembers(
        tenant.id,
        members.map((m) => ({ email: m.email.trim().toLowerCase(), role: m.role, password: m.passwort })),
      )
      toast.success(`„${nameDraft.trim() || tenant.name}" gespeichert.`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (tenant.projekte > 0) {
      toast.error("Mandant hat noch Projekte. Erst Projekte löschen/verschieben.")
      return
    }
    if (!window.confirm(`Mandant „${tenant.name}" wirklich löschen?`)) return
    try {
      await api.deleteTenant(tenant.id)
      onChanged()
      toast.success("Mandant gelöscht.")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen.")
    }
  }

  // T-300: DSGVO-Voll-Export (Art.15/20) als JSON-Download.
  const doExport = async () => {
    setBusy(true)
    try {
      const data = await api.exportTenant(tenant.id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `export-${tenant.slug}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success("Export erstellt.")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Export fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  // T-346: aussetzen/reaktivieren.
  const toggleSuspend = async () => {
    const next = !tenant.suspended
    if (next && !window.confirm(`Mandant „${tenant.name}" aussetzen? Alle Mitglieder verlieren bis zur Reaktivierung den Produktzugriff.`)) return
    try {
      await api.suspendTenant(tenant.id, next)
      onChanged()
      toast.success(next ? "Mandant ausgesetzt." : "Mandant reaktiviert.")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Status konnte nicht geändert werden.")
    }
  }

  // T-300: DSGVO-Anonymisierung (Art.17) — irreversibel, Slug-Tippbestätigung.
  const anonymize = async () => {
    const typed = window.prompt(
      `Mandant „${tenant.name}" anonymisieren. IRREVERSIBEL.\n` +
        `Alle personenbezogenen Daten (Mails, Namen, eigene Einträge) werden entfernt, ` +
        `Projekte/Statistik bleiben anonym erhalten.\n\nTippen Sie zur Bestätigung den Slug "${tenant.slug}":`,
    )
    if (typed == null) return
    if (typed.trim() !== tenant.slug) {
      toast.error("Slug stimmt nicht. Abgebrochen.")
      return
    }
    setBusy(true)
    try {
      const r = await api.anonymizeTenant(tenant.id)
      onChanged()
      toast.success(`Anonymisiert: ${r.anonymizedMembers} Mitglied(er) entfernt.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Anonymisierung fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Kopfzeile: aufklappen + Name + Projekte + Löschen */}
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
            )}
            <span className="rounded-lg bg-primary-50 p-1.5 text-primary-700">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 truncate text-sm font-semibold text-neutral-900">
                {tenant.name}
                {tenant.suspended ? (
                  <span className="shrink-0 rounded-md bg-severity-warnung-bg px-2 py-0.5 text-[10px] font-semibold text-severity-warnung-text">
                    Ausgesetzt
                  </span>
                ) : null}
              </span>
              <span className="block truncate font-mono text-[11px] text-neutral-400">
                {tenant.slug} · {tenant.mitglieder.length} Nutzer
              </span>
            </span>
          </button>
          <span className="hidden items-center gap-1.5 text-xs text-neutral-500 sm:flex">
            <FolderKanban className="h-3.5 w-3.5" />
            {tenant.projekte} {tenant.projekte === 1 ? "Projekt" : "Projekte"}
          </span>
          {/* T-300: DSGVO-Export */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void doExport()}
            disabled={busy}
            aria-label={`Mandant ${tenant.name} exportieren`}
            title="DSGVO-Voll-Export (JSON)"
            className="text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <Download className="h-4 w-4" />
          </Button>
          {/* T-346: aussetzen/reaktivieren */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void toggleSuspend()}
            aria-label={tenant.suspended ? `Mandant ${tenant.name} reaktivieren` : `Mandant ${tenant.name} aussetzen`}
            title={tenant.suspended ? "Reaktivieren" : "Aussetzen (Zugriff sperren)"}
            className="text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            {tenant.suspended ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          {/* T-300: DSGVO-Anonymisierung (irreversibel) */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void anonymize()}
            disabled={busy}
            aria-label={`Mandant ${tenant.name} anonymisieren`}
            title="Anonymisieren (DSGVO Art.17, irreversibel)"
            className="text-neutral-400 hover:bg-severity-kritisch-bg hover:text-severity-kritisch"
          >
            <UserX className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void remove()}
            aria-label={`Mandant ${tenant.name} löschen`}
            className="text-neutral-400 hover:bg-severity-kritisch-bg hover:text-severity-kritisch"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {open ? (
          <div className="border-t border-neutral-100 px-4 py-3">
            {/* Name bearbeiten */}
            <div className="mb-3 flex items-center gap-2">
              {editingName ? (
                <>
                  <Input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setEditingName(false)
                      if (e.key === "Escape") {
                        setNameDraft(tenant.name)
                        setEditingName(false)
                      }
                    }}
                    className="h-8 max-w-sm"
                  />
                  <Button size="icon-sm" variant="ghost" onClick={() => setEditingName(false)} aria-label="Übernehmen">
                    <Check className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <p className="flex items-center gap-2 text-xs text-neutral-500">
                  Name:{" "}
                  <span className="font-medium text-neutral-800">{nameDraft}</span>
                  <button
                    onClick={() => setEditingName(true)}
                    aria-label="Umbenennen"
                    className="cursor-pointer rounded p-0.5 text-neutral-300 transition-colors hover:text-neutral-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </p>
              )}
            </div>

            <TenantLicensePanel tenant={tenant} />

            <TenantBrandingPanel tenant={tenant} onChanged={onChanged} />

            {/* Nutzer-Tabelle */}
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">E-Mail</th>
                    <th className="w-28 px-3 py-2 text-left font-medium">Rolle</th>
                    <th className="px-3 py-2 text-left font-medium">Passwort (neu setzen)</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-xs text-neutral-400">
                        Noch keine Nutzer. Unten hinzufügen.
                      </td>
                    </tr>
                  ) : (
                    members.map((m, i) => (
                      <tr key={i} className="align-middle">
                        <td className="px-3 py-1.5">
                          <Input
                            value={m.email}
                            onChange={(e) => setRow(i, { email: e.target.value })}
                            disabled={!m.isNew}
                            placeholder="nutzer@kunde.de"
                            className="h-8 text-xs disabled:opacity-100"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            value={m.role}
                            onChange={(e) => setRow(i, { role: e.target.value as TenantRole })}
                            className="h-8 w-full cursor-pointer rounded-md border border-neutral-300 bg-white px-2 text-xs focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="password"
                            autoComplete="new-password"
                            value={m.passwort}
                            onChange={(e) => setRow(i, { passwort: e.target.value })}
                            placeholder={m.isNew ? `Passwort (min. ${MIN_PW})` : "(unverändert)"}
                            className="h-8 font-mono text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            aria-label={`${m.email || "Zeile"} entfernen`}
                            className="cursor-pointer rounded p-1 text-neutral-400 transition-colors hover:bg-severity-kritisch-bg hover:text-severity-kritisch"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" /> Nutzer hinzufügen
              </Button>
              <Button size="sm" onClick={() => void save()} loading={busy}>
                <Save className="h-3.5 w-3.5" /> {busy ? "Speichern…" : "Speichern"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-neutral-400">
              Nutzer werden mit Passwort als Kunden-Zugang angelegt (Login: setreo-cloud.com/roadmap). Passwörter
              werden ausschließlich gehasht in setreo-auth-extern gespeichert und sind hier nicht einsehbar. Feld
              leer lassen = unverändert.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// White-Label: EINE Akzentfarbe (Hex) → primary-Ramp wird daraus berechnet; Anzeigename (Tab-Titel)
// + Kundenlogo. Logo wird beim Upload auf 64px Höhe herunterskaliert (reitet im /api/context-Payload).
function TenantBrandingPanel({ tenant, onChanged }: { tenant: Tenant; onChanged: () => void }) {
  const [accent, setAccent] = useState(tenant.branding?.accent ?? "#87b52d")
  const [appName, setAppName] = useState(tenant.branding?.appName ?? "")
  const [logo, setLogo] = useState<string | null>(tenant.branding?.logo ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setAccent(tenant.branding?.accent ?? "#87b52d")
    setAppName(tenant.branding?.appName ?? "")
    setLogo(tenant.branding?.logo ?? null)
  }, [tenant])

  const hexOk = /^#[0-9a-fA-F]{6}$/.test(accent)
  const ramp = hexOk ? primaryRampFromHex(accent) : null

  const onFile = async (file?: File | null) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      toast.error("Logo: PNG, JPEG, WebP oder SVG.")
      return
    }
    try {
      const dataUrl = await fileToLogo(file)
      if (dataUrl.length > 300_000) {
        toast.error("Logo zu groß (max. ~220 KB nach Skalierung). Bitte einfacheres Bild.")
        return
      }
      setLogo(dataUrl)
    } catch {
      toast.error("Logo konnte nicht gelesen werden.")
    }
  }

  const save = async (reset = false) => {
    if (!reset && !hexOk) {
      toast.error("Akzentfarbe: Hex-Code wie #1a73e8.")
      return
    }
    setBusy(true)
    try {
      const payload: Branding | null = reset
        ? null
        : { accent: accent.toLowerCase(), appName: appName.trim() || null, logo: logo || null }
      await api.saveTenantBranding(tenant.id, payload)
      if (reset) {
        setAccent("#87b52d")
        setAppName("")
        setLogo(null)
      }
      onChanged()
      toast.success(reset ? "Branding zurückgesetzt." : "Branding gespeichert.")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-neutral-200 p-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        <Palette className="h-3.5 w-3.5" /> Branding (White-Label)
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Akzentfarbe — eine Farbe, Abstufungen automatisch */}
        <div>
          <Label>Akzentfarbe</Label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={hexOk ? accent : "#87b52d"}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Akzentfarbe wählen"
              className="h-9 w-12 cursor-pointer rounded border border-neutral-200 bg-white p-1"
            />
            <Input
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              placeholder="#87b52d"
              className="h-9 max-w-[150px] font-mono"
            />
          </div>
          {ramp ? (
            <div className="mt-2 flex overflow-hidden rounded border border-neutral-200">
              {Object.values(ramp).map((ch, i) => (
                <div key={i} className="h-5 flex-1" style={{ backgroundColor: `rgb(${ch})` }} title={`rgb(${ch})`} />
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-severity-kritisch">Ungültiger Hex-Code.</p>
          )}
          <p className="mt-1 text-[11px] text-neutral-400">
            Nur diese eine Farbe setzen — die Abstufungen werden automatisch daraus berechnet.
          </p>
        </div>

        {/* Anzeigename + Logo */}
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor={`appname-${tenant.id}`}>Anzeigename (Browser-Tab)</Label>
            <Input
              id={`appname-${tenant.id}`}
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="z.B. Krause Transporte"
              maxLength={60}
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label>Logo (oben im Kopf)</Label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <div className="flex h-10 w-32 items-center justify-center rounded border border-dashed border-neutral-200 bg-neutral-50">
                {logo ? (
                  <img src={logo} alt="Logo-Vorschau" className="max-h-9 max-w-[120px]" />
                ) : (
                  <span className="text-[11px] text-neutral-400">kein Logo</span>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50">
                <Upload className="h-3.5 w-3.5" /> Hochladen
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
              </label>
              {logo ? (
                <button
                  type="button"
                  onClick={() => setLogo(null)}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-severity-kritisch"
                >
                  <ImageOff className="h-3.5 w-3.5" /> Entfernen
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => void save(true)} disabled={busy} className="text-neutral-500">
          <RotateCcw className="h-3.5 w-3.5" /> Auf Setreo zurücksetzen
        </Button>
        <Button size="sm" onClick={() => void save(false)} loading={busy}>
          <Save className="h-3.5 w-3.5" /> Branding speichern
        </Button>
      </div>
    </div>
  )
}

// Logo auf 64px Höhe herunterskalieren (PNG, klein fürs /api/context-Payload). SVG bleibt Vektor.
async function fileToLogo(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(String(fr.result))
    fr.onerror = () => rej(new Error("read"))
    fr.readAsDataURL(file)
  })
  if (file.type === "image/svg+xml") return dataUrl
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => rej(new Error("img"))
    i.src = dataUrl
  })
  const h = 64
  const w = Math.max(1, Math.round((img.width / img.height) * h))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL("image/png")
}

// Lizenz + Seat-Codes eines Mandanten. Lädt beim Aufklappen (GET liefert license + codes).
// Setreo-Admin setzt Plan/Seats/Laufzeit und generiert die Codes (ein Code = ein Seat).
function TenantLicensePanel({ tenant }: { tenant: Tenant }) {
  const [codes, setCodes] = useState<SeatCode[]>([])
  const [plan, setPlan] = useState("standard")
  const [maxSeats, setMaxSeats] = useState(0)
  const [validUntil, setValidUntil] = useState("")
  const [loading, setLoading] = useState(true)
  const [savingLic, setSavingLic] = useState(false)
  const [genBusy, setGenBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.seatCodes(tenant.id)
      setCodes(res.codes)
      setPlan(res.license.plan || "standard")
      setMaxSeats(res.license.maxSeats || 0)
      setValidUntil(res.license.validUntil ? res.license.validUntil.slice(0, 10) : "")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lizenz konnte nicht geladen werden.")
    } finally {
      setLoading(false)
    }
  }, [tenant.id])

  useEffect(() => {
    void load()
  }, [load])

  const saveLicense = async () => {
    if (!Number.isInteger(maxSeats) || maxSeats < 0 || maxSeats > 1000) {
      toast.error("Seats: ganze Zahl zwischen 0 und 1000.")
      return
    }
    setSavingLic(true)
    try {
      await api.setTenantLicense(tenant.id, {
        plan: plan.trim() || "standard",
        maxSeats,
        validUntil: validUntil || null,
      })
      toast.success("Lizenz gespeichert.")
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setSavingLic(false)
    }
  }

  const generate = async () => {
    setGenBusy(true)
    const before = codes.length
    try {
      const res = await api.generateSeatCodes(tenant.id)
      setCodes(res.codes)
      const neu = res.codes.length - before
      toast.success(neu > 0 ? `${neu} neue Seat-Code(s) erzeugt.` : "Alle Seats haben bereits einen Code.")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Generierung fehlgeschlagen.")
    } finally {
      setGenBusy(false)
    }
  }

  const used = codes.filter((c) => c.usedBy).length
  const freie = codes.filter((c) => !c.usedBy)
  const copyFree = () => {
    void navigator.clipboard.writeText(freie.map((c) => c.code).join("\n"))
    toast.success(`${freie.length} freie Code(s) kopiert.`)
  }

  const expiry = (() => {
    if (!validUntil) return null
    const tage = Math.ceil((new Date(`${validUntil}T23:59:59`).getTime() - Date.now()) / 86_400_000)
    if (tage < 0) return { cls: "bg-severity-kritisch-bg text-severity-kritisch-text", text: "Lizenz abgelaufen" }
    if (tage <= 30) return { cls: "bg-severity-warnung-bg text-severity-warnung-text", text: `läuft in ${tage} Tag(en) ab` }
    return { cls: "bg-primary-50 text-primary-700", text: `gültig bis ${formatDateDE(validUntil)}` }
  })()

  return (
    <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        <KeyRound className="h-3.5 w-3.5" /> Lizenz &amp; Seats
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-36">
          <Label htmlFor={`plan-${tenant.id}`}>Plan</Label>
          <Input id={`plan-${tenant.id}`} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="standard" className="h-8 text-xs" />
        </div>
        <div className="sm:w-24">
          <Label htmlFor={`seats-${tenant.id}`}>Seats</Label>
          <Input id={`seats-${tenant.id}`} type="number" min={0} max={1000} value={maxSeats} onChange={(e) => setMaxSeats(Number(e.target.value))} className="h-8 text-xs" />
        </div>
        <div className="sm:w-44">
          <Label htmlFor={`valid-${tenant.id}`}>Laufzeit bis</Label>
          <Input id={`valid-${tenant.id}`} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="h-8 text-xs" />
        </div>
        <Button size="sm" variant="outline" onClick={() => void saveLicense()} loading={savingLic}>
          <Save className="h-3.5 w-3.5" /> Lizenz speichern
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-white px-2 py-1 font-medium text-neutral-700 ring-1 ring-neutral-200">
          Seats belegt: {used} / {Math.max(codes.length, maxSeats)}
        </span>
        {expiry ? <span className={`rounded-md px-2 py-1 font-medium ${expiry.cls}`}>{expiry.text}</span> : null}
        <span className="flex-1" />
        <Button size="xs" variant="outline" onClick={() => void generate()} loading={genBusy}>
          <Plus className="h-3.5 w-3.5" /> Codes auf {maxSeats} auffüllen
        </Button>
        {freie.length > 0 ? (
          <Button size="xs" variant="ghost" onClick={copyFree}>
            <Copy className="h-3.5 w-3.5" /> {freie.length} freie kopieren
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-neutral-400">Lädt …</p>
      ) : codes.length > 0 ? (
        <div className="mt-3 max-h-44 overflow-y-auto rounded-md border border-neutral-200 bg-white">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-neutral-100">
              {codes.map((c) => (
                <tr key={c.code}>
                  <td className="px-3 py-1.5 font-mono">{c.code}</td>
                  <td className="px-3 py-1.5 text-right">
                    {c.usedBy ? (
                      <span className="text-neutral-500">belegt · {c.usedBy}</span>
                    ) : (
                      <span className="font-medium text-primary-700">frei</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-xs text-neutral-400">
          Noch keine Seat-Codes. Seats setzen, Lizenz speichern, dann „Codes auffüllen".
        </p>
      )}
      <p className="mt-2 text-[11px] text-neutral-400">
        Kunden registrieren sich selbst auf setreo-cloud.com und lösen einen Seat-Code ein (ein Code = ein Seat).
        Eine E-Mail gehört genau einem Mandanten.
      </p>
    </div>
  )
}
