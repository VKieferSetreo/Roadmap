// Kleiner Ersteller-Avatar: Initialen aus der E-Mail, deterministische Farbe, Tooltip = wer.
// Zeigt links am Projekt, von wem es angelegt wurde (Tracking bei vielen Nutzern im Mandanten).

const COLORS = ["#0e7490", "#7c3aed", "#b45309", "#16a34a", "#db2777", "#2563eb", "#65a30d", "#0891b2"]

function initials(email: string): string {
  const local = email.split("@")[0] ?? ""
  const parts = local.split(/[.\-_]+/).filter(Boolean)
  const two = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2)
  return (two || "?").toUpperCase().slice(0, 2)
}

function colorFor(email: string): string {
  let h = 0
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

export function CreatorAvatar({ email, size = 20 }: { email?: string | null; size?: number }) {
  if (!email) return null
  return (
    <span
      title={`Angelegt von ${email}`}
      aria-label={`Angelegt von ${email}`}
      style={{ width: size, height: size, background: colorFor(email) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white ring-2 ring-white"
    >
      <span style={{ fontSize: Math.round(size * 0.42) }}>{initials(email)}</span>
    </span>
  )
}
