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
export function modellKonfig(weg = process.env.ANREICHERUNG_WEG || "lokal") {
  if (weg === "openrouter") {
    const schluessel = process.env.OPENROUTER_API_KEY || ""
    return {
      // Ein kleines, günstiges Modell reicht: die Aufgabe ist Lesen, nicht Denken, und der
      // Belegriegel fängt ohnehin ab, was nicht im Text steht.
      name: process.env.ANREICHERUNG_MODELL || "meta-llama/llama-3.1-8b-instruct",
      basis: OPENROUTER,
      schluessel,
      verfuegbar: Boolean(schluessel),
    }
  }
  return {
    name: process.env.ANREICHERUNG_MODELL || "qwen2.5:7b-instruct",
    basis: process.env.OLLAMA_URL || OLLAMA,
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
  return async function rufeModell(prompt, modellName = konfig.name) {
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
