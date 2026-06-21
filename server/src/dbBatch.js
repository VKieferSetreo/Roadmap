// Mehrzeilige Writes als EIN Statement statt N Round-Trips (T-329/T-330).
// Postgres erlaubt max. 65535 Bind-Parameter pro Statement → in Chunks aufteilen.

/** Array in Stücke der Größe `size` zerlegen. */
export const chunk = (arr, size) => {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** VALUES-Platzhalter für `rows` Zeilen à `cols` Spalten: "($1,$2),($3,$4)". */
export const placeholders = (rows, cols) =>
  Array.from({ length: rows }, (_, r) =>
    `(${Array.from({ length: cols }, (_, c) => `$${r * cols + c + 1}`).join(",")})`,
  ).join(",")

// ponytail: 1000 Zeilen × bis ~20 Spalten = 20k Params, klar unter dem 65535-Limit.
export const BATCH_ROWS = 1000

if (process.argv[1]?.endsWith("dbBatch.js")) {
  const a = (cond, msg) => { if (!cond) throw new Error(`dbBatch self-check: ${msg}`) }
  a(chunk([1, 2, 3, 4, 5], 2).length === 3, "chunk count")
  a(chunk([], 2).length === 0, "chunk empty")
  a(placeholders(2, 3) === "($1,$2,$3),($4,$5,$6)", "placeholders 2x3")
  a(placeholders(1, 1) === "($1)", "placeholders 1x1")
  console.log("dbBatch self-check ok")
}
