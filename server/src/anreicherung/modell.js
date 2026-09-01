// Anbindung an ein Sprachmodell — lokal oder über OpenRouter (T-657).
//
// EIN Adapter für beide, weil Ollama seit v0.1.24 dieselbe Schnittstelle spricht wie OpenAI und
// OpenRouter ohnehin. Der Unterschied ist eine Basis-URL und ein Schlüssel, nicht der Code.
//
// Max' Aufteilung (31.08.2026): "einmal über alle machen, die wir jetzt gerade haben, da kannst
// du die Workstation für benutzen, um das mehrere Tage laufen zu lassen mit nem 7b Modell oder so,
// und für zukünftige OpenRouter."
// Der Bestandslauf kostet damit nur Strom, und der laufende Betrieb nur die wenigen neuen Fälle.
//
// ZUGANGSDATEN kommen ausschließlich aus der Umgebung. Kein Schlüssel im Repo, keiner in Tests,
// keiner in einer Commit-Nachricht.

const OLLAMA = "http://100.85.216.95:11434/v1"
const OPENROUTER = "https://openrouter.ai/api/v1"

/**
 * @param {"lokal"|"openrouter"} weg
 * @returns {{name: string, basis: string, schluessel: string|null, verfuegbar: boolean}}
 */
// `env` ist ausdruecklich ein Parameter und kein process.env-Zugriff im Rumpf: sync.js und die
// Admin-Route reichen eine eigene Umgebung durch, und die wurde hier bis 01.09.2026 still
// ignoriert — das Gate waere dort nie angesprungen.
export function modellKonfig(weg = process.env.ANREICHERUNG_WEG || "lokal", env = process.env) {
  if (weg === "openrouter") {
    const schluessel = env.OPENROUTER_API_KEY || ""
    return {
      // Max' Wahl (31.08.2026): gemma zuerst, glm als Rückfall. Beide kostenlos.
      // Gemessen liefen beide an diesem Tag in HTTP 429 — freie Modelle sind kontingentiert und
      // je nach Tageszeit belegt. Deshalb eine KETTE statt eines Modells: läuft das erste in ein
      // Limit, greift das nächste. minimax steht am Ende, es hat als einziges durchgehend
      // geantwortet.
      name: env.ANREICHERUNG_MODELL || "google/gemma-4-31b-it:free",
      basis: OPENROUTER,
      schluessel,
      verfuegbar: Boolean(schluessel),
      // Der Reihe nach, bis eines antwortet. Ein 429 ist kein Fehler des Modells, sondern eine
      // Tagesform — beim nächsten Aufruf kann dasselbe Modell wieder frei sein.
      kette: (env.ANREICHERUNG_MODELL_KETTE || "google/gemma-4-31b-it:free,z-ai/glm-5.2:free,minimax/minimax-m3:free").split(",").map((m) => m.trim()).filter(Boolean),
    }
  }
  return {
    name: env.ANREICHERUNG_MODELL || "qwen2.5:7b-instruct",
    basis: env.OLLAMA_URL || OLLAMA,
    schluessel: null,
    verfuegbar: true, // Erreichbarkeit zeigt sich beim ersten Aufruf, nicht an einer Variablen
  }
}

/**
 * Ein Aufruf. Wirft nie — der Aufrufer bekommt null und vermerkt "fehler", damit ein Lauf über
 * Zehntausende Datensätze nicht an einem einzelnen Zeitüberschritt endet.
 *
 * temperature 0: wir wollen bei gleichem Text zweimal dieselbe Antwort. Eine Extraktion, die
 * beim zweiten Lauf etwas anderes sagt, wäre als Stammdatum wertlos.
 */
export function createModell(konfig = modellKonfig(), { fetchImpl = globalThis.fetch, timeoutMs = 120000 } = {}) {
  const kette = konfig.kette?.length ? konfig.kette : [konfig.name]

  return async function rufeModell(prompt, modellName = null) {
    // Ein Modell nach dem anderen, bis eines antwortet. Bei einem einzelnen Namen (lokal) ist
    // das genau ein Durchgang.
    for (const kandidat of modellName ? [modellName] : kette) {
      const antwort = await einAufruf(prompt, kandidat)
      if (antwort != null) return antwort
    }
    return null
  }

  async function einAufruf(prompt, modellName) {
    const kopf = { "Content-Type": "application/json" }
    if (konfig.schluessel) kopf.Authorization = `Bearer ${konfig.schluessel}`
    // OpenRouter verlangt eine Herkunft, sonst antwortet es mit 401.
    if (konfig.basis === OPENROUTER) kopf["HTTP-Referer"] = "https://setreo-cloud.com"

    try {
      const res = await fetchImpl(`${konfig.basis}/chat/completions`, {
        method: "POST",
        headers: kopf,
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model: modellName,
          temperature: 0,
          // num_ctx klein halten: unsere Prompts liegen bei 1 bis 2k Token, der Standard von
          // 32k reserviert je parallelem Strom KV-Cache fuer das Zehnfache. Gemessen belegte ein
          // 7B mit 32k und vier Stroemen 12,3 von 24,6 GB — mit 4k passen deutlich mehr Stroeme
          // auf dieselbe Karte, und genau die lasten sie aus.
          options: { num_ctx: Number(process.env.ANREICHERUNG_CTX || 4096) },
          messages: [{ role: "user", content: prompt }],
        }),
      })
      if (!res.ok) return null
      const d = await res.json()
      return d?.choices?.[0]?.message?.content ?? null
    } catch {
      return null
    }
  }
}

/** Kurzer Erreichbarkeitstest, damit ein mehrtägiger Lauf nicht ins Leere startet. */
export async function erreichbar(konfig = modellKonfig(), { fetchImpl = globalThis.fetch } = {}) {
  const rufe = createModell(konfig, { fetchImpl, timeoutMs: 20000 })
  const antwort = await rufe('Antworte nur mit: {"angaben": []}')
  return typeof antwort === "string" && antwort.length > 0
}
