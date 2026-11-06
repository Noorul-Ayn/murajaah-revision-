#!/usr/bin/env node
// Fetches the 15-line Madinah mushaf layout (which page and line every word
// sits on) from the Quran.com API and keeps, for each ayah and each print,
// the page, the first and last line of its words, and the line of every word
// (for drawing the page as printed). Two prints are kept: v1 is the 1405H
// King Fahd Complex print, v2 the 1421H print.
//
// Output: data/qurancom/layout.json, committed so builds never need the network.
// Run with: node scripts/fetch-layout.mjs

import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const api = 'https://api.quran.com/api/v4'
const fields = 'verse_key,position,char_type_name,v1_page,line_v1,v2_page,line_v2'

async function getJson(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (i >= tries) throw new Error(`${url}: ${err.message}`)
      await new Promise((r) => setTimeout(r, 1000 * i))
    }
  }
}

const ayahs = new Map()
async function fetchPage(page) {
  const { verses } = await getJson(`${api}/verses/by_page/${page}?words=true&per_page=all&word_fields=${fields}`)
  for (const v of verses) {
    const words = v.words.filter((w) => w.char_type_name === 'word')
    if (words.length === 0) throw new Error(`${v.verse_key} has no words`)
    const span = (pageKey, lineKey) => {
      const pages = new Set(words.map((w) => w[pageKey]))
      const first = words[0]
      const last = words[words.length - 1]
      return [first[pageKey], first[lineKey], last[pageKey], last[lineKey], pages.size]
    }
    // One letter per word: its line (A = 1 … O = 15).
    const lines = (lineKey) => words.map((w) => String.fromCharCode(64 + w[lineKey])).join('')
    ayahs.set(v.verse_key, {
      v1: span('v1_page', 'line_v1'),
      v2: span('v2_page', 'line_v2'),
      w1: lines('line_v1'),
      w2: lines('line_v2'),
    })
  }
}

const pages = Array.from({ length: 604 }, (_, i) => i + 1)
const workers = Array.from({ length: 4 }, async () => {
  for (let p = pages.shift(); p !== undefined; p = pages.shift()) {
    await fetchPage(p)
    if (p % 50 === 0) console.log(`page ${p}`)
  }
})
await Promise.all(workers)

if (ayahs.size !== 6236) throw new Error(`expected 6236 ayahs, got ${ayahs.size}`)
const keys = [...ayahs.keys()].sort((a, b) => {
  const [s1, a1] = a.split(':').map(Number)
  const [s2, a2] = b.split(':').map(Number)
  return s1 - s2 || a1 - a2
})
// [firstPage, firstLine, lastPage, lastLine] per ayah in mushaf order.
const out = {
  source: 'https://api.quran.com/api/v4 (Quran Foundation): verses/by_page with v1_page/line_v1 and v2_page/line_v2',
  fetched: new Date().toISOString().slice(0, 10),
  v1: keys.map((k) => ayahs.get(k).v1.slice(0, 4)),
  v2: keys.map((k) => ayahs.get(k).v2.slice(0, 4)),
  // The line of each word of each ayah, one letter per word.
  words: { v1: keys.map((k) => ayahs.get(k).w1), v2: keys.map((k) => ayahs.get(k).w2) },
}
await mkdir(path.join(root, 'data/qurancom'), { recursive: true })
await writeFile(path.join(root, 'data/qurancom/layout.json'), JSON.stringify(out) + '\n')
console.log('wrote data/qurancom/layout.json')
