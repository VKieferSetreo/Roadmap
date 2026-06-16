// Mandanten-Verwaltung (nur Setreo-Admin): Mandanten anlegen/umbenennen/löschen.
// Pro Mandant ein-/ausklappbar eine Nutzer-Tabelle: E-Mail · Rolle (Admin/User) ·
// Passwort (Klartext, editierbar) · Entfernen. Zentraler Speichern-Button je Mandant.
// Nutzer werden NUR mit Passwort angelegt (Konto in setreo-auth-extern, Login app.setreo-cloud.com).

import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderKanban,
  Pencil,
  Plus,
  Save,
  Trash2,
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
import type { Tenant, TenantMember, TenantRole } from "@/types/domain"
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
  passwort: m.passwort ?? "",
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
            description="Die Mandanten-Verwaltung braucht das Backend — im Demo-Modus nicht verfügbar."
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
  const [showPw, setShowPw] = useState(true)
  const [busy, setBusy] = useState(false)

  // Bei externer Änderung (refresh) den Draft neu aus dem Tenant aufbauen.
  useEffect(() => {
    setMembers(tenant.mitglieder.map(toDraft))
    setNameDraft(tenant.name)
  }, [tenant])

  const setRow = (i: number, patch: Partial<Draft>) =>
    setMembers((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const removeRow = (i: number) => setMembers((rows) => rows.filter((_, idx) => idx !== i))
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
      toast.error("Mandant hat noch Projekte — erst Projekte löschen/verschieben.")
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
              <span className="block truncate text-sm font-semibold text-neutral-900">{tenant.name}</span>
              <span className="block truncate font-mono text-[11px] text-neutral-400">
                {tenant.slug} · {tenant.mitglieder.length} Nutzer
              </span>
            </span>
          </button>
          <span className="hidden items-center gap-1.5 text-xs text-neutral-500 sm:flex">
            <FolderKanban className="h-3.5 w-3.5" />
            {tenant.projekte} {tenant.projekte === 1 ? "Projekt" : "Projekte"}
          </span>
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

            {/* Nutzer-Tabelle */}
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">E-Mail</th>
                    <th className="w-28 px-3 py-2 text-left font-medium">Rolle</th>
                    <th className="px-3 py-2 text-left font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        Passwort
                        <button
                          type="button"
                          onClick={() => setShowPw((s) => !s)}
                          className="text-neutral-400 hover:text-neutral-700"
                          aria-label={showPw ? "Passwörter verbergen" : "Passwörter zeigen"}
                        >
                          {showPw ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                      </span>
                    </th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-xs text-neutral-400">
                        Noch keine Nutzer — unten hinzufügen.
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
                            type={showPw ? "text" : "password"}
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
              Nutzer werden mit Passwort als Kunden-Zugang angelegt (Login: app.setreo-cloud.com). Passwörter
              sind hier im Klartext einsehbar und änderbar.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
