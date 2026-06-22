// News-Feed: alle Nutzer sehen Neuigkeiten (neue Datenquelle, neue Version, Hinweis).
// Setreo-Admin kann posten und löschen. Gelesen-Status wird lokal (localStorage) gestempelt.

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Newspaper, Plus, Trash2 } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input, Label, Textarea } from "@/components/ui/Input"
import { EmptyState } from "@/components/shared/EmptyState"
import { useContextStore } from "@/store/context"
import { useDataSourceStore } from "@/store/datasource"
import { useNewsStore } from "@/store/news"
import { api } from "@/api/roadmap"
import { ApiError } from "@/api/client"
import { formatRelativeDE } from "@/lib/format"
import type { News, NewsKategorie } from "@/types/domain"

const KAT_META: Record<NewsKategorie, { label: string; cls: string }> = {
  datenquelle: { label: "Neue Datenquelle", cls: "bg-primary-50 text-primary-700" },
  version: { label: "Neue Version", cls: "bg-accent-100 text-accent-700" },
  hinweis: { label: "Hinweis", cls: "bg-neutral-100 text-neutral-600" },
}

export function NewsPage() {
  const isAdmin = useContextStore((s) => s.isAdmin)
  const mode = useDataSourceStore((s) => s.mode)
  const apiVersion = useDataSourceStore((s) => s.apiVersion)
  const [items, setItems] = useState<News[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false) // T-228
  const [kategorie, setKategorie] = useState<NewsKategorie>("hinweis")
  const [titel, setTitel] = useState("")
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)

  const syncNews = useNewsStore((s) => s.loadNews)
  const markAllSeen = useNewsStore((s) => s.markAllSeen)

  const load = async () => {
    setLoading(true)
    setError(false)
    try {
      setItems(await api.news.list())
      await syncNews() // Store mitziehen, damit der Ungelesen-Zähler stimmt
      markAllSeen() // Öffnen der Seite = alles gelesen → roter Punkt verschwindet
    } catch {
      // T-228: Fehler ehrlich anzeigen statt als „Noch keine News" zu tarnen.
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (mode === "live") void load()
    else {
      setLoading(false)
      markAllSeen()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const publish = async () => {
    if (!titel.trim()) {
      toast.error("Bitte einen Titel angeben.")
      return
    }
    setBusy(true)
    try {
      await api.news.create({ kategorie, titel: titel.trim(), body: body.trim() })
      setTitel("")
      setBody("")
      setKategorie("hinweis")
      toast.success("News veröffentlicht.")
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Veröffentlichen fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm("Diese News wirklich löschen?")) return
    try {
      await api.news.remove(id)
      setItems((xs) => xs.filter((x) => x.id !== id))
      toast.success("News gelöscht.")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen.")
    }
  }

  if (mode === "demo") {
    return (
      <div className="h-full overflow-y-auto">
        <PageContainer title="News" description="Neuigkeiten zur Plattform." width="narrow">
          <EmptyState
            icon={Newspaper}
            title="Nur mit Live-Datenbank"
            description="Der News-Feed braucht das Backend. Im Demo-Modus nicht verfügbar."
          />
        </PageContainer>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer
        title="News"
        description="Neue Datenquellen, neue Versionen und Hinweise zur Plattform."
      >
        <div className="flex flex-col gap-5">
          {apiVersion ? (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
              Aktuelle Version
              <span className="font-semibold text-neutral-800">v{apiVersion}</span>
            </span>
          ) : null}
          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">News veröffentlichen</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="sm:w-52">
                    <Label htmlFor="n-kat">Kategorie</Label>
                    <select
                      id="n-kat"
                      value={kategorie}
                      onChange={(e) => setKategorie(e.target.value as NewsKategorie)}
                      className="h-9 w-full cursor-pointer rounded-md border border-neutral-300 bg-white px-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    >
                      <option value="hinweis">Hinweis</option>
                      <option value="datenquelle">Neue Datenquelle</option>
                      <option value="version">Neue Version</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="n-titel">Titel</Label>
                    <Input
                      id="n-titel"
                      value={titel}
                      onChange={(e) => setTitel(e.target.value)}
                      placeholder="z.B. Bayern-Baustellen jetzt angebunden"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="n-body">Text (optional)</Label>
                  <Textarea
                    id="n-body"
                    rows={3}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Details zur Neuigkeit …"
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => void publish()} loading={busy}>
                    <Plus className="h-4 w-4" /> Veröffentlichen
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {loading ? (
            <p className="text-sm text-neutral-400">Lädt …</p>
          ) : error ? (
            // T-228: Ladefehler ehrlich statt „Noch keine News".
            <EmptyState
              icon={Newspaper}
              title="News konnten nicht geladen werden"
              description="Der News-Feed ist gerade nicht erreichbar. Bitte später erneut versuchen."
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              title="Noch keine News"
              description="Sobald es Neuigkeiten gibt, erscheinen sie hier."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((n) => {
                const meta = KAT_META[n.kategorie] ?? KAT_META.hinweis
                return (
                  <Card key={n.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
                              {meta.label}
                            </span>
                            <span className="text-xs text-neutral-400">
                              {formatRelativeDE(n.publishedAt)}
                            </span>
                          </div>
                          <h3 className="text-sm font-semibold text-neutral-900">{n.titel}</h3>
                          {n.body ? (
                            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{n.body}</p>
                          ) : null}
                        </div>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => void remove(n.id)}
                            aria-label="News löschen"
                            className="shrink-0 rounded p-1 text-neutral-400 transition-colors hover:bg-severity-kritisch-bg hover:text-severity-kritisch"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </PageContainer>
    </div>
  )
}
