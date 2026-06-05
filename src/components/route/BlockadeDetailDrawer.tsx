import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Euro,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Info,
  Mail,
  MapPin,
  Phone,
  Radio,
  Route,
  XCircle,
} from "lucide-react"
import { Sheet, SheetBody, SheetFooter, SheetHeader } from "@/components/ui/Sheet"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/cn"
import type { Blockade, BlockadeAttachment, Severity } from "@/data/mockRoute"

const SEVERITY_META: Record<
  Severity,
  {
    label: string
    headline: string
    bg: string
    text: string
    border: string
    icon: typeof XCircle
    accent: string
  }
> = {
  blocked: {
    label: "gesperrt",
    headline: "Strecke nicht befahrbar",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    icon: XCircle,
    accent: "bg-red-500",
  },
  warning: {
    label: "Warnung",
    headline: "Nur mit Auflagen befahrbar",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    icon: AlertTriangle,
    accent: "bg-amber-500",
  },
  ok: {
    label: "frei",
    headline: "Strecke befahrbar",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    icon: CheckCircle2,
    accent: "bg-emerald-500",
  },
}

export function BlockadeDetailDrawer({
  blockade,
  onClose,
}: {
  blockade: Blockade | null
  onClose: () => void
}) {
  const open = blockade !== null
  return (
    <Sheet
      open={open}
      onClose={onClose}
      ariaLabel="Blockade-Detail"
      size="default"
      modal={false}
    >
      {blockade ? <Content blockade={blockade} onClose={onClose} /> : null}
    </Sheet>
  )
}

function Content({ blockade, onClose }: { blockade: Blockade; onClose: () => void }) {
  const meta = SEVERITY_META[blockade.severity]
  const Icon = meta.icon

  return (
    <>
      <SheetHeader
        title={
          <>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border",
                meta.bg,
                meta.text,
                meta.border,
              )}
            >
              {meta.label}
            </span>
            <span className="text-neutral-900">{blockade.title}</span>
          </>
        }
        subtitle={
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-semibold text-neutral-700">
              <Route className="h-3 w-3" />
              {blockade.road}
            </span>
            <span className="text-neutral-400">·</span>
            <span className="tabular-nums">{blockade.km}</span>
            <span className="text-neutral-400">·</span>
            <span>{blockade.category}</span>
          </span>
        }
        onClose={onClose}
      />

      <SheetBody className="flex flex-col gap-6">
        {/* Statusbanner */}
        <div
          className={cn(
            "rounded-lg border p-4 flex items-start gap-3",
            meta.bg,
            meta.border,
          )}
        >
          <span
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-full text-white flex-shrink-0",
              meta.accent,
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className={cn("text-sm font-semibold", meta.text)}>{meta.headline}</div>
            <div className="text-xs text-neutral-700 mt-0.5">{blockade.description}</div>
          </div>
        </div>

        {/* Lead + Stichpunkte */}
        {blockade.detail || blockade.detailBullets?.length ? (
          <Section icon={Info} title="Details">
            {blockade.detail ? (
              <p className="text-sm text-neutral-700 leading-relaxed mb-2">
                {blockade.detail}
              </p>
            ) : null}
            {blockade.detailBullets?.length ? (
              <ul className="flex flex-col gap-1.5">
                {blockade.detailBullets.map((b, i) => (
                  <li key={i} className="text-sm text-neutral-700 leading-snug flex gap-2">
                    <span
                      className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary-500 flex-shrink-0"
                      aria-hidden
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>
        ) : null}

        {/* Restriktionen */}
        {blockade.restrictions?.length ? (
          <Section icon={AlertTriangle} title="Restriktionen vs. Fahrzeug-Profil">
            <div className="overflow-hidden rounded-md border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Parameter</th>
                    <th className="text-left px-3 py-2 font-semibold">Soll (Strecke)</th>
                    <th className="text-left px-3 py-2 font-semibold">Ist (Transport)</th>
                    <th className="text-right px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {blockade.restrictions.map((r, i) => (
                    <tr key={i} className={r.ok ? "" : "bg-red-50/30"}>
                      <td className="px-3 py-2 text-neutral-800 font-medium">{r.label}</td>
                      <td className="px-3 py-2 text-neutral-600 tabular-nums">{r.soll}</td>
                      <td className="px-3 py-2 text-neutral-600 tabular-nums">{r.ist}</td>
                      <td className="px-3 py-2 text-right">
                        {r.ok ? (
                          <CheckCircle2 className="inline h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="inline h-4 w-4 text-red-600" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        ) : null}

        {/* Gültigkeit */}
        {(blockade.validFrom || blockade.validUntil) && (
          <Section icon={Calendar} title="Gültigkeit">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <KeyVal label="Gültig ab" value={blockade.validFrom ?? "—"} />
              <KeyVal label="Gültig bis" value={blockade.validUntil ?? "unbefristet"} />
            </div>
          </Section>
        )}

        {/* Auswirkung */}
        {blockade.effect ? (
          <Section icon={Route} title="Auswirkung auf Transport">
            <div className="grid grid-cols-3 gap-3">
              <Stat
                icon={Route}
                label="Mehrweg"
                value={`${blockade.effect.detourKm} km`}
                tone={blockade.effect.detourKm > 0 ? "warning" : "ok"}
              />
              <Stat
                icon={Clock}
                label="Mehrzeit"
                value={`${blockade.effect.extraTimeMin} min`}
                tone={blockade.effect.extraTimeMin > 0 ? "warning" : "ok"}
              />
              <Stat
                icon={Euro}
                label="Mehrkosten"
                value={`${blockade.effect.extraCostEur} €`}
                tone={blockade.effect.extraCostEur > 0 ? "warning" : "ok"}
              />
            </div>
          </Section>
        ) : null}

        {/* Hinweise */}
        {blockade.notes?.length ? (
          <Section icon={Info} title="Hinweise">
            <ul className="flex flex-col gap-1.5">
              {blockade.notes.map((n, i) => (
                <li
                  key={i}
                  className="text-sm text-neutral-700 leading-relaxed flex gap-2"
                >
                  <span
                    className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary-500 flex-shrink-0"
                    aria-hidden
                  />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Quelle — prominenter Link-Button */}
        {blockade.source ? (
          <Section icon={Radio} title="Datenquelle">
            <a
              href={blockade.source.url ?? "#"}
              target={blockade.source.url ? "_blank" : undefined}
              rel="noreferrer"
              onClick={(e) => {
                if (!blockade.source?.url) e.preventDefault()
              }}
              className={cn(
                "group block rounded-md border p-3 transition-colors",
                blockade.source.url
                  ? "border-primary-200 bg-primary-50/40 hover:bg-primary-50 hover:border-primary-300 cursor-pointer"
                  : "border-neutral-200 bg-neutral-50/50 cursor-default",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5">
                    {blockade.source.name}
                    {blockade.source.url ? (
                      <ExternalLink className="h-3 w-3 text-primary-700 group-hover:translate-x-0.5 transition-transform" />
                    ) : null}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    Letzte Aktualisierung: {blockade.source.lastUpdate}
                  </div>
                </div>
                {blockade.source.url ? (
                  <span className="text-[11px] text-primary-700 font-semibold whitespace-nowrap">
                    Zur Quelle →
                  </span>
                ) : null}
              </div>
              {blockade.source.url ? (
                <div className="mt-1.5 text-[10px] text-neutral-400 font-mono truncate">
                  {blockade.source.url}
                </div>
              ) : null}
            </a>
          </Section>
        ) : null}

        {/* Zuständige Behörde */}
        {blockade.authority ? (
          <Section icon={Building2} title="Zuständige Stelle">
            <div className="rounded-md border border-neutral-200 p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-900">
                    {blockade.authority.name}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {blockade.authority.contact}
                  </div>
                </div>
                {blockade.authority.url ? (
                  <a
                    href={blockade.authority.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary-700 hover:text-primary-800 font-semibold whitespace-nowrap"
                  >
                    Website
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <a
                  href={`tel:${blockade.authority.phone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-2 text-neutral-700 hover:text-primary-700"
                >
                  <Phone className="h-3.5 w-3.5 text-neutral-400" />
                  <span className="tabular-nums">{blockade.authority.phone}</span>
                </a>
                <a
                  href={`mailto:${blockade.authority.email}`}
                  className="inline-flex items-center gap-2 text-neutral-700 hover:text-primary-700"
                >
                  <Mail className="h-3.5 w-3.5 text-neutral-400" />
                  <span>{blockade.authority.email}</span>
                </a>
              </div>
            </div>
          </Section>
        ) : null}

        {/* Anhänge */}
        {blockade.attachments?.length ? (
          <Section icon={FileText} title="Dokumente">
            <ul className="flex flex-col gap-1.5">
              {blockade.attachments.map((a, i) => (
                <AttachmentRow key={i} attachment={a} />
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Geo-Info ganz unten */}
        <Section icon={MapPin} title="Geo-Position">
          <div className="text-sm text-neutral-700 tabular-nums">
            {blockade.position[0].toFixed(5)}° N · {blockade.position[1].toFixed(5)}° E
          </div>
        </Section>
      </SheetBody>

      <SheetFooter>
        <Button variant="outline" size="sm">
          <FileDown className="h-3.5 w-3.5" />
          PDF
        </Button>
        <Button variant="outline" size="sm">
          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
          Excel
        </Button>
        <Button variant="primary" size="sm">
          <Route className="h-3.5 w-3.5" />
          Umfahren
        </Button>
      </SheetFooter>
    </>
  )
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Info
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {title}
      </h3>
      {children}
    </section>
  )
}

function KeyVal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
        {label}
      </div>
      <div className="text-sm text-neutral-900 font-semibold mt-0.5">{value}</div>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Info
  label: string
  value: string
  tone: "ok" | "warning"
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : "bg-amber-50 border-amber-200 text-amber-800"
  return (
    <div className={cn("rounded-md border p-3", cls)}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-lg font-bold mt-1 tabular-nums">{value}</div>
    </div>
  )
}

function AttachmentRow({ attachment }: { attachment: BlockadeAttachment }) {
  const Icon =
    attachment.type === "image" ? ImageIcon : attachment.type === "doc" ? FileText : FileText
  const clickable = !!attachment.url
  const Wrapper: React.ElementType = clickable ? "a" : "li"
  const wrapperProps = clickable
    ? { href: attachment.url, target: "_blank", rel: "noreferrer" }
    : {}
  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2",
        clickable
          ? "hover:bg-neutral-50 hover:border-primary-300 cursor-pointer"
          : "cursor-default",
      )}
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary-50 text-primary-700 flex-shrink-0">
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-neutral-900 truncate flex items-center gap-1.5">
          {attachment.title}
          {clickable ? <ExternalLink className="h-3 w-3 text-neutral-400" /> : null}
        </div>
        <div className="text-[11px] text-neutral-500 uppercase tracking-wide">
          {attachment.type} · {attachment.size}
        </div>
      </div>
      <FileDown className="h-4 w-4 text-neutral-400" />
    </Wrapper>
  )
}
