// Request-ID-Korrelation (T-468): nimmt die vom FE gesendete X-Request-Id (oder erzeugt eine),
// hängt sie an req.requestId und echot sie als X-Trace-Id zurück. Das FE (src/api/client.ts)
// sendet die ID bereits und persistiert die zurückgegebene Trace-ID — hier ist die Gegenseite.

import { randomUUID } from "node:crypto"

export function requestId() {
  return (req, res, next) => {
    const incoming = req.get("X-Request-Id")
    req.requestId = incoming && incoming.length <= 200 ? incoming : randomUUID()
    res.setHeader("X-Trace-Id", req.requestId)
    next()
  }
}
