// Datenabdeckungs-Scoreboard (in-app, Datenbank-Reiter): Bundesländer × Datentypen.
// Pro Zelle links Ist-Score (gefüllt), rechts erreichbares Maximum mit öffentlich verfügbaren
// Daten (Rahmen). Grün ab ≥85, gelb 60–84, rot <60. Quelle je Zelle als Tooltip.
// Bewertet die Verfügbarkeit amtlicher Quellen (nicht die tagesaktuelle Meldungszahl).

const KATS = ["Autobahn", "Baustellen", "Sperrungen", "Brücken", "Tunnel", "Gewicht/GST"] as const

// je Bundesland, je Kategorie [ist, max, quelle] — Reihenfolge = KATS
const DATA: Record<string, [number, number, string][]> = {
  "Baden-Württemberg": [[95, 95, "Autobahn GmbH (0001)"], [95, 95, "MobiData BW / BEMaS (0128) + Städte"], [90, 92, "BEMaS-Sperrungen"], [35, 50, "nur WSV-Brücken (0303)"], [30, 45, "nur WSV"], [40, 52, "keine offene GST-Quelle"]],
  "Bayern": [[95, 95, "Autobahn GmbH (0001)"], [35, 85, "nur Städte; BayernInfo (Registrierung) wäre landesweit"], [35, 85, "BayernInfo erreichbar"], [80, 85, "BAYSIS Bauwerke (0123)"], [70, 80, "BAYSIS"], [35, 50, "keine offene GST-Quelle"]],
  "Berlin": [[95, 95, "Autobahn GmbH"], [95, 95, "VIZ Berlin (0114/0115)"], [95, 95, "VIZ Berlin"], [88, 90, "Detailnetz (0116)"], [80, 85, "Detailnetz"], [50, 62, "indirekt über VIZ"]],
  "Brandenburg": [[95, 95, "Autobahn GmbH"], [92, 92, "GDI-BB Baustellen-WFS (0132)"], [90, 92, "GDI-BB"], [30, 50, "nur WSV (0303)"], [25, 40, "nur WSV"], [35, 50, "keine offene"]],
  "Bremen": [[95, 95, "Autobahn GmbH"], [15, 85, "keine freie live; Bremen Mobilithek (Open Data)"], [15, 85, "Mobilithek"], [25, 45, "nur WSV"], [20, 35, "nur WSV"], [20, 40, "keine offene"]],
  "Hamburg": [[95, 95, "Autobahn GmbH"], [95, 95, "Baustellen HH (0112/0113)"], [92, 95, "HH"], [88, 90, "Brücken HH (0111)"], [75, 82, "LSBG"], [90, 92, "GST-Routen HH (0110)"]],
  "Hessen": [[95, 95, "Autobahn GmbH"], [22, 88, "keine offene landesweite; Hessen Mobil Mobilithek"], [22, 88, "Mobilithek"], [80, 85, "Hessen Mobil Brücken (0126)"], [55, 65, "Hessen Mobil"], [70, 78, "Hessen Mobil GST"]],
  "Mecklenburg-Vorpommern": [[95, 95, "Autobahn GmbH"], [90, 92, "LS M-V (0119) + Rostock"], [88, 92, "LS M-V"], [30, 48, "nur WSV"], [25, 38, "nur WSV"], [60, 68, "Rostock GST (0223)"]],
  "Niedersachsen": [[95, 95, "Autobahn GmbH"], [25, 92, "nur Osnabrück; NLStBV Mobilithek (Open Data)"], [25, 90, "NLStBV Mobilithek"], [30, 48, "nur WSV"], [25, 38, "nur WSV"], [30, 45, "keine offene"]],
  "Nordrhein-Westfalen": [[95, 95, "Autobahn GmbH"], [70, 92, "Städte+RVR (0302); LVZ.NRW (Mobilithek) landesweit"], [70, 92, "+ LVZ.NRW"], [90, 92, "Straßen.NRW Bauwerke (0125) + GST (0124)"], [80, 85, "Straßen.NRW"], [88, 90, "GST-Karte NRW (0124)"]],
  "Rheinland-Pfalz": [[95, 95, "Autobahn GmbH"], [95, 95, "Mobilitätsatlas RLP bis Gemeinde (0129)"], [92, 95, "Mobilitätsatlas RLP"], [30, 48, "nur WSV"], [25, 38, "nur WSV"], [35, 48, "keine offene"]],
  "Saarland": [[95, 95, "Autobahn GmbH"], [90, 92, "baustellen.saarland (0127)"], [88, 92, "LfS Saarland"], [28, 45, "nur WSV"], [22, 35, "nur WSV"], [30, 45, "keine offene"]],
  "Sachsen": [[95, 95, "Autobahn GmbH"], [95, 95, "Baustelleninfo Sachsen LASuV (0130)"], [92, 95, "LASuV"], [65, 72, "GST-Negativkarten (0121)"], [40, 55, "teilweise"], [75, 80, "Leipzig (0221) + GST-Negativ (0121)"]],
  "Sachsen-Anhalt": [[95, 95, "Autobahn GmbH"], [65, 82, "LSBB Sperrinfo (0120), Schwerpunkt Sperrungen"], [90, 92, "LSBB Sperrinfo"], [30, 48, "nur WSV"], [25, 38, "nur WSV"], [35, 48, "keine offene"]],
  "Schleswig-Holstein": [[95, 95, "Autobahn GmbH"], [92, 92, "LBV.SH (0117/0118)"], [90, 92, "LBV.SH"], [30, 48, "nur WSV"], [25, 38, "nur WSV"], [35, 48, "keine offene"]],
  "Thüringen": [[95, 95, "Autobahn GmbH"], [95, 95, "TLBV BIS A/B/L/K/G (0131)"], [92, 95, "TLBV BIS"], [30, 48, "nur WSV"], [25, 38, "nur WSV"], [40, 52, "teilweise über TLBV"]],
}

const cls = (s: number) => (s >= 85 ? "g" : s >= 60 ? "y" : "r")
// AA-sichere Textfarben auf Weiss (grün/amber dunkler als die früheren #16a34a/#d97706,
// die als 14px-Text < 4.5:1 lagen). Rot #dc2626 = 4.83:1 ok.
const COL: Record<string, string> = { g: "#15803d", y: "#a16207", r: "#dc2626" }
const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length)

// Erreichte Quote = Ist ÷ Max in % ("wieviel vom öffentlich Möglichen haben wir schon"),
// eingefärbt nach denselben Schwellen (grün ≥85, gelb 60–84, rot <60). Ist/Max im Tooltip.
const quote = (ist: number, max: number) => (max > 0 ? Math.round((ist / max) * 100) : 0)

function Cell({ ist, max, quelle, land, kat }: { ist: number; max: number; quelle: string; land: string; kat: string }) {
  const pct = quote(ist, max)
  return (
    <td className="border-l border-neutral-100 px-2 py-2 text-center" title={`${land} · ${kat} — ${pct}% (Ist ${ist} / Max ${max}): ${quelle}`}>
      <span className="tabular-nums text-sm font-bold" style={{ color: COL[cls(pct)] }}>{pct}%</span>
    </td>
  )
}

export function AbdeckungBoard() {
  const laender = Object.entries(DATA)
  const colIst = KATS.map((_, i) => laender.map(([, cells]) => cells[i][0]))
  const colMax = KATS.map((_, i) => laender.map(([, cells]) => cells[i][1]))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-neutral-600">
        <span className="flex items-center gap-1.5"><b className="tabular-nums" style={{ color: COL.g }}>NN%</b> erreichte Abdeckung (Ist ÷ Max, öffentlich Mögliches) — Ist/Max im Tooltip</span>
        <span>
          Farbe: <b style={{ color: COL.g }}>grün ≥ 85</b> · <b style={{ color: COL.y }}>gelb 60–84</b> · <b style={{ color: COL.r }}>rot &lt; 60</b>
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-neutral-100 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-600">Bundesland</th>
              {KATS.map((k) => (
                <th key={k} className="border-l border-neutral-200 bg-neutral-100 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">{k}</th>
              ))}
              <th className="border-l border-neutral-200 bg-neutral-100 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">Ø</th>
            </tr>
          </thead>
          <tbody>
            {laender.map(([land, cells]) => {
              const ist = cells.map((c) => c[0])
              const max = cells.map((c) => c[1])
              return (
                <tr key={land} className="border-t border-neutral-100 hover:bg-neutral-50/60">
                  <th className="px-4 py-1.5 text-left text-[13.5px] font-semibold text-neutral-900">
                    {land}
                    <span className="block text-[11px] font-normal text-neutral-500">Ø {quote(avg(ist), avg(max))}%</span>
                  </th>
                  {cells.map((c, i) => (
                    <Cell key={i} ist={c[0]} max={c[1]} quelle={c[2]} land={land} kat={KATS[i]} />
                  ))}
                  <Cell ist={avg(ist)} max={avg(max)} quelle="Durchschnitt über alle Datentypen" land={land} kat="Ø" />
                </tr>
              )
            })}
            <tr className="border-t-2 border-neutral-300 bg-neutral-50">
              <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Ø je Datentyp</th>
              {KATS.map((k, i) => (
                <Cell key={k} ist={avg(colIst[i])} max={avg(colMax[i])} quelle="Durchschnitt über alle Länder" land={k} kat="Ø" />
              ))}
              <Cell ist={avg(colIst.flat())} max={avg(colMax.flat())} quelle="Gesamt" land="Gesamt" kat="Ø" />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        Die Ampel bewertet, ob für Bundesland × Datentyp eine flächendeckende <b>amtliche Quelle</b> angebunden ist
        (nicht die tagesaktuelle Meldungszahl). Die <b>%-Zahl</b> = Ist ÷ Max, also der Anteil des öffentlich Möglichen,
        den wir schon haben. <b>Ist niedrig, Max hoch</b> = frei verfügbare Daten existieren, müssen
        nur angebunden werden (NI/Hessen/Bremen/Bayern via Mobilithek/BayernInfo). <b>Auch Max niedrig</b> = öffentlich
        nicht verfügbar (Brücken/Tunnel/Gewicht außerhalb NRW/Bayern/Berlin/Hamburg/Hessen — nur WSV-Brücken frei).
        Öffentliche Version: <code className="rounded bg-neutral-100 px-1">setreo-cloud.com/roadmap/abdeckung</code>
      </p>
    </div>
  )
}
