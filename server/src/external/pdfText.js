// PDF→Text-Extraktion (in-memory). Für den VEMAGS-Upload (T-567): der Bescheid-Buffer kommt
// rein, wird zu Text extrahiert und SOFORT wieder verworfen — kein Disk/DB/Log (Max-Auflage:
// VEMAGS-Bescheide = sensible Kundendaten, NIE speichern). Text-PDFs (kein OCR).

import { PDFParse } from "pdf-parse"

/**
 * @param {Buffer|Uint8Array} buffer  PDF-Rohdaten (wird nicht gespeichert).
 * @returns {Promise<string>} extrahierter Text.
 */
export async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const { text } = await parser.getText()
    return text ?? ""
  } finally {
    await parser.destroy() // Worker/Speicher freigeben — der Buffer hängt sonst am pdf.js-Dokument.
  }
}
