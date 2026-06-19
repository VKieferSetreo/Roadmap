// Kleiner Ersteller-Avatar: Initialen aus der E-Mail, deterministische Farbe, Tooltip = wer.
// Zeigt links am Projekt, von wem es angelegt wurde (Tracking bei vielen Nutzern im Mandanten).
// Nutzt den kanonischen Avatar-Helfer (Look + Farbe projektweit einheitlich).

import { avatarBg, initialsFromEmail } from "@/lib/auth"

export function CreatorAvatar({ email, size = 20 }: { email?: string | null; size?: number }) {
  if (!email) return null
  return (
    <span
      title={`Angelegt von ${email}`}
      aria-label={`Angelegt von ${email}`}
      style={{ width: size, height: size, background: avatarBg(email) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white ring-2 ring-white"
    >
      <span style={{ fontSize: Math.round(size * 0.42) }}>{initialsFromEmail(email)}</span>
    </span>
  )
}
