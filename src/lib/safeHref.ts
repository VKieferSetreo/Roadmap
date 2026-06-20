// ponytail: tiny allowlist guard for href sinks (T-291). Blocks javascript:,
// data:text/html and data:image/svg+xml (stored-XSS → Admin-Takeover); allows
// only http(s)/mailto/tel and raster data-images (bug-report screenshots).
const SAFE_SCHEME = /^(?:https?:|mailto:|tel:)/i
const SAFE_DATA_IMG = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i

/** Returns `url` only if it uses a safe scheme, else "#". */
export function safeHref(url: string | null | undefined): string {
  if (typeof url !== "string") return "#"
  const u = url.trim()
  return SAFE_SCHEME.test(u) || SAFE_DATA_IMG.test(u) ? u : "#"
}
