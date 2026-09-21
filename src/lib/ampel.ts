// Ampelfarben der Änderungsverfolgung. Rot = schlecht für den Transportplaner, grün = gut.
//
// Liegt bewusst HIER und nicht in VeraenderungenCharts: die Kennzahl-Kacheln brauchen dieselben
// Werte, und die Chart-Datei wird lazy geladen (recharts). Ein Import von dort in die Seite
// zöge recharts zurück ins Hauptbundle.
//
// Rot/Orange/Gelb/Grün ist NICHT rotgrün-sicher (validate_palette.js: #87b52d↔#eda100 ΔE 0,9
// protan). Max' ausdrückliche Entscheidung vom 2026-09-21 nach Hinweis. Die Trennung für
// Normalsicht ist dagegen gemessen: Rot #b42318 statt eines helleren Rots hebt sich von
// Orange #eb6834 ab (ΔE 17,4; ein helleres Rot lag bei 10,7 und damit unter der 15er-Schwelle).
// Grün ist das Setreo-Primary. Wer die Werte ändert: Validator laufen lassen, nicht schätzen.
export const AMPEL = {
  rot: "#b42318",
  orange: "#eb6834",
  gelb: "#eda100",
  gruen: "#87b52d",
  grau: "#a1a1aa",
} as const
