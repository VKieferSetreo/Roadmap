// Straßenklasse aus der Koordinate (T-749, Max: "Ohne Zuordnung darf es nicht geben").
// Der entscheidende Fall ist die Kante OHNE Kennzeichen und OHNE Namen: 84 % der bis dahin
// nicht zugeordneten Stichprobe. Sie fiel vorher durch und blieb dauerhaft ohne Klasse.

import { describe, expect, it } from "vitest"
import { klasseAus, loeseStrassenklassen } from "../src/worker/strassenklasse.js"

/** Minimal-DB: liefert eine Zeile ohne Klasse, merkt sich, was gesetzt wird. */
const fakeDb = () => {
  const gesetzt = []
  return {
    gesetzt,
    query: async (sql, params) => {
      if (sql.includes("FROM obstacles")) {
        return { rows: [{ id: "11111111-1111-4111-8111-111111111111", lat: 52.5, lng: 13.4 }] }
      }
      if (sql.includes("FROM geo_strassenklasse")) return { rows: [] }
      if (sql.includes("UPDATE obstacles")) {
        gesetzt.push(...JSON.parse(params[0]))
        return { rows: [], rowCount: JSON.parse(params[0]).length }
      }
      return { rows: [], rowCount: 0 }
    },
  }
}

const osrmAntwort = (step) => async () => ({
  ok: true,
  json: async () => ({ routes: [{ legs: [{ steps: step ? [step] : [] }] }] }),
})

describe("loeseStrassenklassen", () => {
  it("Kante ohne Kennzeichen und ohne Namen gilt als Gemeindestraße", async () => {
    // Genau der Fall aus Prod: OSRM verortet die Stelle (Snap 0-6 m), die Kante traegt aber
    // nichts. Autobahn/Bundes-/Landes-/Kreisstrasse fuehren ihr Kennzeichen in OSM ausnahmslos,
    // also bleibt nur kommunal.
    const db = fakeDb()
    const r = await loeseStrassenklassen(db, {
      basis: "http://osrm.test", fetchImpl: osrmAntwort({ name: "", ref: null }),
    })
    expect(r.gesetzt).toBe(1)
    expect(db.gesetzt[0][1]).toBe("gemeindestrasse")
  })

  it("Kennzeichen schlägt den Fallback", async () => {
    const db = fakeDb()
    await loeseStrassenklassen(db, {
      basis: "http://osrm.test", fetchImpl: osrmAntwort({ name: "", ref: "A 7" }),
    })
    expect(db.gesetzt[0][1]).toBe("autobahn")
  })

  it("keine Antwort von OSRM setzt nichts — ein Abrufproblem ist keine Aussage", async () => {
    const db = fakeDb()
    const r = await loeseStrassenklassen(db, {
      basis: "http://osrm.test", fetchImpl: osrmAntwort(null),
    })
    expect(r.gesetzt).toBe(0)
    expect(db.gesetzt).toHaveLength(0)
  })

  it("klasseAus bleibt eine reine Ableitung aus Kennzeichen und Name", () => {
    expect(klasseAus("A 7", "")).toBe("autobahn")
    expect(klasseAus("B27", "")).toBe("bundesstrasse")
    expect(klasseAus("St 2043", "")).toBe("landesstrasse")
    expect(klasseAus("L84", "")).toBe("landesstrasse")
    expect(klasseAus("K 30", "")).toBe("kreisstrasse")
    expect(klasseAus(null, "Feigstraße")).toBe("gemeindestrasse")
    expect(klasseAus(null, "")).toBeNull()
  })
})
