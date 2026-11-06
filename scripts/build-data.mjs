#!/usr/bin/env node
// Builds src/data/quran-hafs.json from the verbatim Tanzil files in data/tanzil/.
// The ayah text is copied byte-for-byte; nothing in it is altered.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (name) => readFile(path.join(root, 'data', 'tanzil', name), 'utf8')

const textXml = await read('quran-uthmani.xml')
const metaXml = await read('quran-data.xml')

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name) => ['sura', 'aya', 'juz', 'quarter', 'page', 'sajda'].includes(name),
  // Keep attribute values as raw strings so the Arabic text is never touched.
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
})

const copyright = textXml
  .match(/<!--([\s\S]*?)-->/)[1]
  .split('\n')
  .map((l) => l.replace(/^#\s?/, '').trimEnd())
  .filter((l) => l.trim() && !/^=+$/.test(l.trim()))
  .join('\n')
  .trim()

const versionLine = copyright.match(/Tanzil Quran Text \(([^)]+)\)/)
if (!versionLine) throw new Error('Could not read the Tanzil version from the copyright block')

const text = parser.parse(textXml).quran
const meta = parser.parse(metaXml).quran

const surahMeta = meta.suras.sura
if (surahMeta.length !== 114) throw new Error(`expected 114 surahs, got ${surahMeta.length}`)

const ayahs = []
const surahs = surahMeta.map((s, i) => {
  const t = text.sura[i]
  const n = Number(s.index)
  if (Number(t.index) !== n) throw new Error(`surah order mismatch at ${n}`)
  if (t.name !== s.name) throw new Error(`surah name mismatch at ${n}`)
  const start = Number(s.start)
  if (start !== ayahs.length) throw new Error(`surah ${n} start ${start} != ${ayahs.length}`)
  let basmala = null
  t.aya.forEach((a, j) => {
    if (Number(a.index) !== j + 1) throw new Error(`ayah order mismatch at ${n}:${j + 1}`)
    if (a.bismillah) {
      if (j !== 0) throw new Error(`basmala on a non-first ayah at ${n}:${j + 1}`)
      basmala = a.bismillah
    }
    ayahs.push(a.text)
  })
  if (t.aya.length !== Number(s.ayas)) throw new Error(`surah ${n} ayah count mismatch`)
  return {
    n,
    name: s.name,
    tname: s.tname,
    ename: s.ename,
    type: s.type === 'Meccan' ? 'meccan' : 'medinan',
    ayahs: Number(s.ayas),
    start,
    // Basmala shown before ayah 1 (not counted as an ayah). Al-Fatiha's basmala
    // is its first ayah and At-Tawba has none, so both are null here.
    basmala,
  }
})

const toIndex = ({ sura, aya }) => surahs[Number(sura) - 1].start + Number(aya) - 1
const starts = (list, expected, label) => {
  if (list.length !== expected) throw new Error(`expected ${expected} ${label}, got ${list.length}`)
  list.forEach((x, i) => {
    if (Number(x.index) !== i + 1) throw new Error(`${label} order mismatch at ${i + 1}`)
  })
  return list.map(toIndex)
}

// Rub' al-hizb starts. The Madani mushaf marks each quarter with ۞, and the
// Tanzil text carries that mark (except where a quarter begins a surah). The
// Tanzil metadata list is checked against those in-text marks; where the list
// disagrees with the text, the text wins and the correction is recorded.
const RUB = '\u06DE'
const marked = new Set(ayahs.flatMap((t, i) => (t.includes(RUB) ? [i] : [])))
const surahStarts = new Set(surahs.map((s) => s.start))
const keyOf = (i) => {
  const s = surahs.findLast((x) => x.start <= i)
  return `${s.n}:${i - s.start + 1}`
}
const corrections = []
const quarters = starts(meta.hizbs.quarter, 240, 'quarters').map((q, i) => {
  if (marked.has(q) || surahStarts.has(q)) return q
  const near = [q - 2, q - 1, q + 1, q + 2].filter((x) => marked.has(x))
  if (near.length !== 1) throw new Error(`quarter ${i + 1} at ${keyOf(q)} has no rub' mark nearby`)
  corrections.push(
    `Quarter ${i + 1}: Tanzil metadata lists ${keyOf(q)}, but the rub' mark in the text is on ${keyOf(near[0])}; using ${keyOf(near[0])}.`,
  )
  return near[0]
})
const unused = [...marked].filter((i) => !quarters.includes(i))
if (unused.length) throw new Error(`rub' marks not matched to a quarter: ${unused.map(keyOf).join(', ')}`)
quarters.forEach((q, i) => {
  if (i && q <= quarters[i - 1]) throw new Error(`quarters out of order at ${i + 1}`)
})

const data = {
  copyright,
  source: {
    name: 'Tanzil Project',
    version: versionLine[1],
    url: 'https://tanzil.net',
    license: 'Creative Commons Attribution 3.0 (verbatim copies only)',
    riwaya: 'hafs',
    corrections,
  },
  surahs,
  juz: starts(meta.juzs.juz, 30, 'juz'),
  quarters,
  pages: starts(meta.pages.page, 604, 'pages'),
  sajdas: meta.sajdas.sajda.map(toIndex),
  ayahs,
}

if (ayahs.length !== 6236) throw new Error(`expected 6236 ayahs, got ${ayahs.length}`)

// Plain-spelling text (Tanzil "Simple Clean"), one entry per ayah, for
// matching what speech recognition hears. Copied unchanged.
const simpleXml = await read('quran-simple-clean.xml')
const simple = parser.parse(simpleXml).quran.sura.flatMap((s) => s.aya.map((a) => a.text))
if (simple.length !== ayahs.length) throw new Error(`simple text has ${simple.length} ayahs`)
const simpleCopyright = simpleXml
  .match(/<!--([\s\S]*?)-->/)[1]
  .split('\n')
  .map((l) => l.replace(/^#\s?/, '').trimEnd())
  .filter((l) => l.trim() && !/^=+$/.test(l.trim()))
  .join('\n')
  .trim()

await mkdir(path.join(root, 'src', 'data'), { recursive: true })
await writeFile(
  path.join(root, 'src', 'data', 'quran-simple.json'),
  JSON.stringify({ copyright: simpleCopyright, ayahs: simple }) + '\n',
)
const out = path.join(root, 'src', 'data', 'quran-hafs.json')
await writeFile(out, JSON.stringify(data) + '\n')
console.log(
  `wrote src/data/quran-hafs.json: ${surahs.length} surahs, ${ayahs.length} ayahs, ` +
    `${data.quarters.length} quarters, ${data.pages.length} pages (Tanzil ${data.source.version})`,
)
corrections.forEach((c) => console.log(`  correction: ${c}`))
