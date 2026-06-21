// Datenabdeckung Deutschland — EINZIGE Quelle (T-482) für das interne Board (AbdeckungBoard.tsx)
// UND die öffentliche Seite (/roadmap/abdeckung). Beide lesen GET /api/abdeckung; kein zweites
// hartkodiertes DATA-Literal mehr (vorher divergierten public/abdeckung/index.html und der Code).
//
// WICHTIG: Die %-Werte sind eine REDAKTIONELLE Einschätzung der Quellen-Verfügbarkeit
// (amtliche Quelle angebunden ja/nein, ist÷max), KEIN aus der DB berechneter Echtzeit-Status.
// Bei Pflege: Zellen anpassen UND STAND hochsetzen — beides hier, an einer Stelle.

export const ABDECKUNG_STAND = "2026-06-21" // Datum der letzten redaktionellen Durchsicht
export const ABDECKUNG_KATS = ["Autobahn", "Baustellen", "Sperrungen", "Brücken", "Tunnel", "Gewicht/GST"]

// je Bundesland, je Kategorie: [ist, max, quelle]   (Reihenfolge = ABDECKUNG_KATS)
export const ABDECKUNG_DATA = {
  "Baden-Württemberg": [[95, 95, "Autobahn GmbH (0001)"], [95, 95, "MobiData BW / BEMaS (0128) — öffentliches Optimum"], [90, 92, "BEMaS-Sperrungen (0128)"], [35, 50, "nur WSV-Brücken (0303); Land-Kataster nicht offen"], [30, 45, "nur WSV; öffentlich begrenzt"], [40, 52, "keine offene GST-Quelle"]],
  "Bayern": [[95, 95, "Autobahn GmbH (0001)"], [35, 85, "nur Städte (0210/0224); BayernInfo (Registrierung, frei) wäre landesweit"], [35, 85, "BayernInfo erreichbar"], [80, 85, "BAYSIS Bauwerke (0123)"], [70, 80, "BAYSIS (0123)"], [35, 50, "keine offene GST-Quelle"]],
  "Berlin": [[95, 95, "Autobahn GmbH (0001)"], [95, 95, "VIZ Berlin (0114/0115)"], [95, 95, "VIZ Berlin"], [88, 90, "Detailnetz Ingenieurbauwerke (0116)"], [80, 85, "Detailnetz (0116)"], [50, 62, "indirekt über VIZ"]],
  "Brandenburg": [[95, 95, "Autobahn GmbH (0001)"], [92, 92, "GDI-BB Baustellen-WFS (0132)"], [90, 92, "GDI-BB (0132)"], [30, 50, "nur WSV-Brücken (0303)"], [25, 40, "nur WSV"], [35, 50, "keine offene GST-Quelle"]],
  "Bremen": [[95, 95, "Autobahn GmbH (0001)"], [82, 85, "VMZ Bremen Mobilithek (0142) angebunden, Open Data"], [82, 85, "VMZ Bremen Mobilithek (0142)"], [25, 45, "nur WSV-Brücken (0303)"], [20, 35, "nur WSV"], [20, 40, "keine offene"]],
  "Hamburg": [[95, 95, "Autobahn GmbH (0001)"], [95, 95, "Baustellen HH (0112/0113)"], [92, 95, "HH (0112/0113)"], [88, 90, "Brücken/Ingenieurbauwerke HH (0111)"], [75, 82, "LSBG (0111)"], [90, 92, "GST-Routen HH (0110)"]],
  "Hessen": [[95, 95, "Autobahn GmbH (0001)"], [85, 88, "Hessen Mobil Mobilithek (0141) angebunden"], [85, 88, "Hessen Mobil Mobilithek (0141)"], [80, 85, "Hessen Mobil lastbeschränkte Brücken (0126)"], [55, 65, "Hessen Mobil (0126)"], [70, 78, "Hessen Mobil GST (0126)"]],
  "Mecklenburg-Vorpommern": [[95, 95, "Autobahn GmbH (0001)"], [90, 92, "LS M-V (0119) + Rostock (0222)"], [88, 92, "LS M-V (0119)"], [30, 48, "nur WSV-Brücken (0303)"], [25, 38, "nur WSV"], [60, 68, "Rostock GST (0223)"]],
  "Niedersachsen": [[95, 95, "Autobahn GmbH (0001)"], [80, 92, "NLStBV Mobilithek (0140) via LCL/TMC angebunden"], [78, 90, "NLStBV Mobilithek (0140)"], [30, 48, "nur WSV-Brücken (0303)"], [25, 38, "nur WSV"], [30, 45, "keine offene"]],
  "Nordrhein-Westfalen": [[95, 95, "Autobahn GmbH (0001)"], [70, 92, "Städte+RVR (0302); LVZ.NRW Arbeitsstellen (Mobilithek) wäre nachgeordnetes Netz landesweit"], [70, 92, "+ LVZ.NRW erreichbar"], [90, 92, "Straßen.NRW Bauwerke (0125) + GST-Karte (0124)"], [80, 85, "Straßen.NRW (0125)"], [88, 90, "GST-Schwertransportkarte NRW (0124)"]],
  "Rheinland-Pfalz": [[95, 95, "Autobahn GmbH (0001)"], [95, 95, "Mobilitätsatlas RLP — bis Gemeinde (0129)"], [92, 95, "Mobilitätsatlas RLP (0129)"], [30, 48, "nur WSV-Brücken (0303)"], [25, 38, "nur WSV"], [35, 48, "keine offene"]],
  "Saarland": [[95, 95, "Autobahn GmbH (0001)"], [90, 92, "baustellen.saarland (0127)"], [88, 92, "LfS Saarland (0127)"], [28, 45, "nur WSV-Brücken (0303)"], [22, 35, "nur WSV"], [30, 45, "keine offene"]],
  "Sachsen": [[95, 95, "Autobahn GmbH (0001)"], [95, 95, "Baustelleninfo Sachsen LASuV (0130)"], [92, 95, "LASuV (0130)"], [65, 72, "GST-Negativkarten gesperrte Brücken (0121)"], [40, 55, "teilweise (0121)"], [75, 80, "Leipzig Verkehrszeichen (0221) + GST-Negativ (0121)"]],
  "Sachsen-Anhalt": [[95, 95, "Autobahn GmbH (0001)"], [65, 82, "LSBB Sperrinfo (0120) — Schwerpunkt Sperrungen; mehr Baustellen begrenzt offen"], [90, 92, "LSBB Sperrinfo (0120)"], [30, 48, "nur WSV-Brücken (0303)"], [25, 38, "nur WSV"], [35, 48, "keine offene"]],
  "Schleswig-Holstein": [[95, 95, "Autobahn GmbH (0001)"], [92, 92, "LBV.SH (0117/0118)"], [90, 92, "LBV.SH (0117/0118)"], [30, 48, "nur WSV-Brücken (0303)"], [25, 38, "nur WSV"], [35, 48, "keine offene"]],
  "Thüringen": [[95, 95, "Autobahn GmbH (0001)"], [95, 95, "TLBV BIS — A/B/L/K/G (0131)"], [92, 95, "TLBV BIS (0131)"], [30, 48, "nur WSV-Brücken (0303)"], [25, 38, "nur WSV"], [40, 52, "teilweise über TLBV"]],
}

export const ABDECKUNG_HINWEIS =
  "Redaktionelle Einschätzung der Quellen-Abdeckung (welche amtliche Quelle je Bundesland × Datentyp " +
  "angebunden ist), kein aus der Datenbank berechneter Echtzeit-Status."

if (process.argv[1]?.endsWith("abdeckung.js")) {
  const a = (c, m) => { if (!c) throw new Error("abdeckung self-check: " + m) }
  const n = ABDECKUNG_KATS.length
  for (const [land, rows] of Object.entries(ABDECKUNG_DATA)) {
    a(rows.length === n, `${land}: ${rows.length} Zellen, erwartet ${n}`)
    for (const c of rows) a(Array.isArray(c) && c.length === 3 && c[0] <= c[1], `${land}: Zelle [ist,max,quelle], ist<=max`)
  }
  console.log("abdeckung self-check ok:", Object.keys(ABDECKUNG_DATA).length, "Länder ×", n, "Kategorien")
}
