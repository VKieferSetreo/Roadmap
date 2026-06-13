// Mandanten-Verwaltung (nur Setreo-Admin): Mandanten anlegen/umbenennen/löschen +
// Mitglieder (E-Mail-Zuordnung) pflegen. Zwei Konto-Wege:
//   intern  — Hub-Konto (setreo-auth) im Hub anlegen, hier nur E-Mail zuordnen
//   extern  — Kunden-Zugang (setreo-auth-extern) direkt hier anlegen,
//             Login über app.setreo-cloud.com

import { useState } from "react"
import { Navigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Building2,
  Check,
  FolderKanban,
  KeyRound,
  Pencil,
  Plus,
  Trash2,
  Users,
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
import type { Tenant } from "@/types/domain"
import { ApiError } from "@/api/client"

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
        <PageContainer
          title="Mandanten"
          description="Mandanten- und Nutzer-Zuordnung."
          width="narrow"
        >
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
        description="Kunden-Mandanten verwalten: Teams arbeiten getrennt, innerhalb eines Mandanten ist alles geteilt."
      >
        <div className="flex flex-col gap-5">
          {/* Neuer Mandant */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Neuen Mandanten anlegen</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="t-name">Name</Label>
                <Input
                  id="t-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Krause Schwertransporte GmbH"
                />
              </div>
              <div className="sm:w-56">
                <Label htmlFor="t-slug">Kürzel (für Links)</Label>
                <Input
                  id="t-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="z.B. krause"
                  className="font-mono"
                />
              </div>
              <Button onClick={() => void create()} disabled={busy}>
                <Plus className="h-4 w-4" /> Anlegen
              </Button>
            </CardContent>
          </Card>

          {/* Bestehende Mandanten */}
          {tenants.length === 0 ? (
            <EmptyState icon={Building2} title="Noch keine Mandanten" />
          ) : (
            <div className="flex flex-col gap-4">
              {tenants.map((t) => (
                <TenantCard key={t.id} tenant={t} onChanged={() => void refreshTenants()} />
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </div>
  )
}

function TenantCard({ tenant, onChanged }: { tenant: Tenant; onChanged: () => void }) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(tenant.name)
  const [emailDraft, setEmailDraft] = useState("")
  const [busy, setBusy] = useState(false)

  const saveName = async () => {
    const n = nameDraft.trim()
    setEditingName(false)
    if (!n || n === tenant.name) return
    try {
      await api.renameTenant(tenant.id, n)
      onChanged()
      toast.success("Umbenannt.")
    } catch {
      toast.error("Umbenennen fehlgeschlagen.")
    }
  }

  const setMembers = async (emails: string[]) => {
    setBusy(true)
    try {
      await api.setTenantMembers(tenant.id, emails)
      onChanged()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Mitglieder konnten nicht gespeichert werden.",
      )
    } finally {
      setBusy(false)
    }
  }

  const addMember = async () => {
    const email = emailDraft.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error("Bitte eine gültige E-Mail-Adresse angeben.")
      return
    }
    if (tenant.mitglieder.includes(email)) {
      toast.error("Diese E-Mail ist bereits zugeordnet.")
      return
    }
    await setMembers([...tenant.mitglieder, email])
    setEmailDraft("")
  }

  const removeMember = (email: string) =>
    void setMembers(tenant.mitglieder.filter((m) => m !== email))

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
    } catch {
      toast.error("Löschen fehlgeschlagen.")
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-primary-50 p-2 text-primary-700">
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveName()
                    if (e.key === "Escape") setEditingName(false)
                  }}
                  className="h-8 max-w-sm"
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void saveName()}
                  aria-label="Speichern"
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                {tenant.name}
                <button
                  onClick={() => {
                    setNameDraft(tenant.name)
                    setEditingName(true)
                  }}
                  aria-label="Umbenennen"
                  className="cursor-pointer rounded p-0.5 text-neutral-300 transition-colors hover:text-neutral-600"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </p>
            )}
            <p className="font-mono text-xs text-neutral-400">
              {tenant.slug} · Share-Links: setreo-cloud.com/{tenant.slug}/…
            </p>
          </div>
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

        {/* Mitglieder */}
        <div className="border-t border-neutral-100 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
            <Users className="h-3.5 w-3.5" /> Mitglieder ({tenant.mitglieder.length})
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {tenant.mitglieder.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 py-1 pl-3 pr-1 text-xs text-neutral-700"
              >
                {email}
                <button
                  onClick={() => removeMember(email)}
                  disabled={busy}
                  aria-label={`${email} entfernen`}
                  className="cursor-pointer rounded-full p-0.5 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1.5">
              <Input
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addMember()
                }}
                placeholder="nutzer@kunde.de"
                className="h-7 w-52 text-xs"
                aria-label={`Mitglied zu ${tenant.name} hinzufügen`}
              />
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => void addMember()}
                disabled={busy}
                aria-label="Hinzufügen"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            Interne Konten (Hub) werden in der Hub-Nutzerverwaltung angelegt — hier nur die
            Zuordnung zum Mandanten.
          </p>
        </div>

        {/* Kunden-Zugang (setreo-auth-extern) */}
        <ExternalAccessForm tenant={tenant} onChanged={onChanged} />
      </CardContent>
    </Card>
  )
}

/** Externer Kunden-Zugang: legt das Konto in setreo-auth-extern an (Upsert =
 *  Passwort-Reset bei Bestand) und trägt die E-Mail als Mitglied ein. */
function ExternalAccessForm({ tenant, onChanged }: { tenant: Tenant; onChanged: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  const create = async () => {
    const mail = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      toast.error("Bitte eine gültige E-Mail-Adresse angeben.")
      return
    }
    if (password.length < 10) {
      toast.error("Passwort: mindestens 10 Zeichen.")
      return
    }
    setBusy(true)
    try {
      const res = await api.createTenantUser(tenant.id, mail, password)
      onChanged()
      setEmail("")
      setPassword("")
      toast.success(
        res.created
          ? `Zugang für ${mail} angelegt — Login: app.setreo-cloud.com`
          : `Passwort für ${mail} neu gesetzt.`,
      )
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Zugang konnte nicht angelegt werden.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-neutral-100 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
        <KeyRound className="h-3.5 w-3.5" /> Kunden-Zugang (app.setreo-cloud.com)
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nutzer@kunde.de"
          className="h-7 w-52 text-xs"
          aria-label={`Kunden-Zugang für ${tenant.name}: E-Mail`}
        />
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create()
          }}
          placeholder="Passwort (min. 10 Zeichen)"
          className="h-7 w-52 text-xs"
          aria-label={`Kunden-Zugang für ${tenant.name}: Passwort`}
        />
        <Button size="sm" variant="outline" onClick={() => void create()} disabled={busy}>
          <Plus className="h-3.5 w-3.5" /> Zugang anlegen
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-neutral-400">
        Eigenes, getrenntes Login für externe Nutzer — bestehende E-Mail erhält ein neues Passwort.
      </p>
    </div>
  )
}
