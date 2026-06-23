// Google-Maps-Link → geordnete Wegpunkte (Stopps). Koordinaten direkt, Ortsnamen als {name}.
import { describe, it, expect } from "vitest"
import { extractMapsStops } from "../src/external/gmaps.js"

describe("extractMapsStops", () => {
  it("/maps/dir/ mit Koordinaten — @-Mitte + data= ignoriert", async () => {
    const url = "https://www.google.com/maps/dir/48.53,8.08/49.01,8.40/@48.7,8.2,9z/data=!4m2!4m1!3e0"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([{ lat: 48.53, lng: 8.08 }, { lat: 49.01, lng: 8.40 }])
  })

  it("?api=1 mit origin/waypoints/destination in Reihenfolge", async () => {
    const url = "https://www.google.com/maps/dir/?api=1&origin=48.53,8.08&waypoints=48.7,8.2&destination=49.01,8.40&travelmode=driving"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([
      { lat: 48.53, lng: 8.08 },
      { lat: 48.7, lng: 8.2 },
      { lat: 49.01, lng: 8.40 },
    ])
  })

  it("Ortsnamen (mit + als Leerzeichen) → {name} zum Geokodieren", async () => {
    const url = "https://www.google.com/maps/dir/Oberkirch/Bad+Rappenau/Karlsruhe"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([{ name: "Oberkirch" }, { name: "Bad Rappenau" }, { name: "Karlsruhe" }])
  })

  it("Kurz-Link wird server-seitig aufgelöst (fetchImpl-Redirect)", async () => {
    // follow-Kontrakt: undici folgt bis zur finalen res.url (Google managt Consent/Cookie-Bounce).
    const fetchImpl = async () => ({ url: "https://www.google.com/maps/dir/48.5,8.0/49.0,8.4/" })
    const { stops, resolvedUrl } = await extractMapsStops("https://maps.app.goo.gl/abc123", { fetchImpl })
    expect(resolvedUrl).toContain("/maps/dir/")
    expect(stops).toEqual([{ lat: 48.5, lng: 8.0 }, { lat: 49.0, lng: 8.4 }])
  })

  it("T-301 SSRF: finale Nicht-Google/interne URL wird NICHT zurückgegeben", async () => {
    // Selbst wenn die Auflösung wider Erwarten auf einer internen IP landet → Original behalten.
    const fetchImpl = async () => ({ url: "http://169.254.169.254/latest/meta-data/" })
    const { stops, resolvedUrl } = await extractMapsStops("https://maps.app.goo.gl/evil", { fetchImpl })
    expect(resolvedUrl).not.toContain("169.254") // interne IP nie reflektieren
    expect(stops).toEqual([]) // Original-Kurzlink hat keine Stopps
  })

  it("Regression (Bug 2026-06-21): /dir/-URL mit zwei Koordinaten → 2 Wegpunkte", async () => {
    // Genau die Struktur des gemeldeten Links (maps.app.goo.gl → google.de/maps/dir/lat,lng/lat,lng/@center/data=…).
    const final =
      "https://www.google.de/maps/dir/51.6889035,7.9320421/51.7142651,7.9791429/@51.7130116,7.9071838,8492m/data=!3m1!1e3"
    const fetchImpl = async () => ({ url: final })
    const { stops } = await extractMapsStops("https://maps.app.goo.gl/9gU5F7q6GmBkVgj67", { fetchImpl })
    expect(stops).toEqual([{ lat: 51.6889035, lng: 7.9320421 }, { lat: 51.7142651, lng: 7.9791429 }])
  })

  it("Einzel-Ort/Murks → keine 2 Wegpunkte", async () => {
    const { stops } = await extractMapsStops("https://www.google.com/maps/place/Köln/@50.9,6.9,12z")
    expect(stops.length).toBeLessThan(2)
  })

  it("Consent-Gate: continue-Param wird gefolgt", async () => {
    const target = "https://www.google.com/maps/dir/48.5,8.0/49.0,8.4/"
    // Kurz-Link → 302 auf consent.google.com (continue=Ziel); danach kein Redirect mehr.
    // follow endet auf consent.google.com?continue=Ziel → continue-Param wird ausgepackt.
    const fetchImpl = async () => ({ url: `https://consent.google.com/m?continue=${encodeURIComponent(target)}&gl=DE` })
    const { stops } = await extractMapsStops("https://maps.app.goo.gl/x", { fetchImpl })
    expect(stops).toEqual([{ lat: 48.5, lng: 8.0 }, { lat: 49.0, lng: 8.4 }])
  })

  it("echter Share-Link: Viewport-/POI-Müll-Koordinaten im data-Blob verdrängen NICHT das Ziel", async () => {
    // Pfad nennt 3 Stopps; data-Blob hat ZUSÄTZLICHE !1d!2d (Karten-Mitte/Viewport) → früher
    // wurden die mitgenommen und das Ziel fiel raus. Jetzt: vollständige Pfad-Stopps.
    const url =
      "https://www.google.com/maps/dir/Freiburg/Frankfurt/Hamburg/@50.1,8.6,7z/" +
      "data=!4m2!1d7.85!2d47.99!1d8.68!2d50.11!1d9.99!2d53.55!1d6.5!2d51.0!3e0"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([{ name: "Freiburg" }, { name: "Frankfurt" }, { name: "Hamburg" }])
  })

  it("data-Koordinaten exakt so viele wie Pfad-Stopps → präzise Koordinaten nutzen", async () => {
    const url =
      "https://www.google.com/maps/dir/Freiburg/Hamburg/@50,9,7z/data=!4m2!1d7.85!2d47.99!1d9.99!2d53.55!3e0"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([{ lat: 47.99, lng: 7.85 }, { lat: 53.55, lng: 9.99 }])
  })

  it("data=-Fallback (!3d lat !4d lng) wenn Pfad keine Stopps hat", async () => {
    const url = "https://www.google.com/maps/dir/@48.7,8.2,9z/data=!3d48.5!4d8.0!3d49.0!4d8.4"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([{ lat: 48.5, lng: 8.0 }, { lat: 49.0, lng: 8.4 }])
  })

  it("echter Share-Link: Pfad nennt nur Start+Ziel, Vias stehen STRUKTURIERT im data-Blob", async () => {
    // Reproduziert den gemeldeten Bug (maps.app.goo.gl/cLEDp3u…): /dir/<Start>/<Ziel> + 5 per Hand
    // gezogene Zwischenstopps NUR im data-Blob als !2m2!1d!2d (Start/Ziel) bzw. !1m2!1d!2d (Vias).
    // Früher: 2 Pfad-Namen + 7 Koordinaten → Anzahl ≠ → nur Namen geokodiert → komplett andere Route.
    // Jetzt: die 7 strukturierten Wegpunkte in Reihenfolge (1d=lng, 2d=lat).
    const url =
      "https://www.google.com/maps/dir/Bad+Salzuflen/Erndtebr%C3%BCck/@51.24,8.26,10z/data=!3m1!5s0x0:0x0" +
      "!4m38!1m30!1m1!1s0x0:0x0!2m2!1d8.6640951!2d52.0718414" +
      "!3m4!1m2!1d7.9711021!2d51.6964951!3s0x0:0x0!3m4!1m2!1d8.1273778!2d51.5931863!3s0x0:0x0" +
      "!3m4!1m2!1d8.5693191!2d51.4400746!3s0x0:0x0!3m4!1m2!1d8.7336351!2d51.4218003!3s0x0:0x0" +
      "!3m4!1m2!1d9.0147485!2d51.4905143!3s0x0:0x0!1m5!1m1!1s0x0:0x0!2m2!1d8.3114803!2d50.9944656!3e0"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([
      { lat: 52.0718414, lng: 8.6640951 },
      { lat: 51.6964951, lng: 7.9711021 },
      { lat: 51.5931863, lng: 8.1273778 },
      { lat: 51.4400746, lng: 8.5693191 },
      { lat: 51.4218003, lng: 8.7336351 },
      { lat: 51.4905143, lng: 9.0147485 },
      { lat: 50.9944656, lng: 8.3114803 },
    ])
  })

  it("strukturiert NUR Start+Ziel (keine Vias) → 2 präzise Koordinaten statt Namen-Geocoding", async () => {
    const url =
      "https://www.google.de/maps/dir/Aachen/K%C3%B6ln/@50.8,6.5,10z/data=!4m14!4m13" +
      "!1m5!1m1!1s0x0:0x0!2m2!1d6.0838868!2d50.7753455!1m5!1m1!1s0x0:0x0!2m2!1d6.9602786!2d50.937531!3e0"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([{ lat: 50.7753455, lng: 6.0838868 }, { lat: 50.937531, lng: 6.9602786 }])
  })

  it("gemischter Pfad (Name + Koordinate) + strukturierter Blob → strukturierte Wegpunkte gewinnen", async () => {
    const url =
      "https://www.google.com/maps/dir/Dortmund/51.5,7.5/Hamm/@51.5,7.6,10z/data=!4m20!4m19" +
      "!1m5!1m1!1s0x0:0x0!2m2!1d7.4653!2d51.5136!1m2!1d7.55!2d51.52!1m5!1m1!1s0x0:0x0!2m2!1d7.815!2d51.6739!3e0"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([
      { lat: 51.5136, lng: 7.4653 },
      { lat: 51.52, lng: 7.55 },
      { lat: 51.6739, lng: 7.815 },
    ])
  })

  it("strukturierte Koordinaten WENIGER als Pfad-Namen → vollständige Pfad-Namen (kein Stopp-Verlust)", async () => {
    // Defensiv: hätte der Blob nur Start+Ziel als Koord, aber der Pfad 3 benannte Stopps,
    // würden wir mit den Strukturkoordinaten den mittleren Stopp verlieren → lieber Namen.
    const url =
      "https://www.google.com/maps/dir/Bonn/Siegburg/Köln/@50.8,7.1,11z/data=!4m14!4m13" +
      "!1m5!1m1!1s0x0:0x0!2m2!1d7.0982!2d50.7374!1m5!1m1!1s0x0:0x0!2m2!1d6.9603!2d50.9375!3e0"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([{ name: "Bonn" }, { name: "Siegburg" }, { name: "Köln" }])
  })

  it("?api=1 mit Ortsnamen (statt Koordinaten) → Namen zum Geokodieren", async () => {
    const url =
      "https://www.google.com/maps/dir/?api=1&origin=Aachen&waypoints=D%C3%BCren%7CK%C3%B6ln&destination=Bonn"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([{ name: "Aachen" }, { name: "Düren" }, { name: "Köln" }, { name: "Bonn" }])
  })

  it("lat/lng-Reihenfolge: strukturiert !1d=lng !2d=lat (NICHT vertauscht)", async () => {
    // Wäre 1d/2d vertauscht, läge der Punkt bei lat 6.96 (Golf von Guinea) statt in Köln.
    const url =
      "https://www.google.com/maps/dir/A/B/data=!4m14!4m13!1m5!1m1!1s0x0:0x0!2m2!1d6.96!2d50.94" +
      "!1m5!1m1!1s0x0:0x0!2m2!1d8.68!2d50.11!3e0"
    const { stops } = await extractMapsStops(url)
    expect(stops[0]).toEqual({ lat: 50.94, lng: 6.96 })
    expect(stops[1]).toEqual({ lat: 50.11, lng: 8.68 })
  })
})
