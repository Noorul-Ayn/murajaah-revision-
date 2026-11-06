#!/usr/bin/env node
// Builds src/data/layout.json from data/qurancom/layout.json (see
// fetch-layout.mjs): for each Madinah mushaf print, the first ayah of every
// page and the line (1–15) each ayah begins and ends on.
//
// Lines are stored as one letter per ayah (A = line 1 … O = line 15) to keep
// the file small. The script refuses to write anything inconsistent: pages
// must start in order, no ayah may cross a page, every line must be in range,
// and the 1405H print's pages must equal Tanzil's page data, which the rest of
// the app was built and checked against.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const raw = JSON.parse(await readFile(path.join(root, 'data/qurancom/layout.json'), 'utf8'))
const quran = JSON.parse(await readFile(path.join(root, 'src/data/quran-hafs.json'), 'utf8'))

const AYAHS = 6236
const PAGES = 604
const letter = (line) => String.fromCharCode(64 + line)

function build(rows, name) {
  if (rows.length !== AYAHS) throw new Error(`${name}: ${rows.length} ayahs`)
  const pages = []
  let first = ''
  let last = ''
  rows.forEach(([page, line, endPage, endLine], i) => {
    if (page !== endPage) throw new Error(`${name}: ayah ${i} crosses from page ${page} to ${endPage}`)
    if (!(line >= 1 && line <= 15 && endLine >= line && endLine <= 15)) {
      throw new Error(`${name}: ayah ${i} has lines ${line}–${endLine}`)
    }
    if (page === pages.length + 1) pages.push(i)
    else if (page !== pages.length) throw new Error(`${name}: ayah ${i} is on page ${page} after page ${pages.length}`)
    first += letter(line)
    last += letter(endLine)
  })
  if (pages.length !== PAGES) throw new Error(`${name}: ${pages.length} pages`)
  return { pages, first, last }
}

const prints = { 1405: build(raw.v1, '1405'), 1421: build(raw.v2, '1421') }

const tanzil = quran.pages
const mismatch = prints[1405].pages.findIndex((start, p) => start !== tanzil[p])
if (mismatch >= 0) throw new Error(`1405 print: page ${mismatch + 1} differs from Tanzil`)

const out = {
  source: raw.source,
  fetched: raw.fetched,
  note: '1405: King Fahd Complex Madinah mushaf, 1405H print. 1421: the 1421H print and later. Lines: A = 1 … O = 15.',
  prints,
}
await writeFile(path.join(root, 'src/data/layout.json'), JSON.stringify(out) + '\n')
const moved = prints[1421].pages.filter((s, p) => s !== tanzil[p]).length
console.log(`wrote src/data/layout.json (1421 print: ${moved} pages start elsewhere than in 1405)`)
