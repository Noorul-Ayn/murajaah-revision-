#!/usr/bin/env node
// Independent check of the juz, rub' al-hizb and page boundaries against the
// quran.com API (a second, separately maintained data set). Writes the API's
// answers to tests/fixtures/qurancom-boundaries.json so the unit tests can
// compare against them offline, and exits non-zero on any disagreement.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const api = 'https://api.quran.com/api/v4'
const getJson = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.json()
}

const { rub_el_hizbs } = await getJson(`${api}/rub_el_hizbs`)
const { juzs } = await getJson(`${api}/juzs`)

// quran.com verse ids are 1-based positions in the mushaf.
const quarters = rub_el_hizbs
  .sort((a, b) => a.rub_el_hizb_number - b.rub_el_hizb_number)
  .map((r) => r.first_verse_id - 1)
const juz = [...new Map(juzs.map((j) => [j.juz_number, j.first_verse_id - 1])).entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([, v]) => v)

const pageStarts = []
for (let ch = 1; ch <= 114; ch++) {
  let page = 1
  for (;;) {
    const r = await getJson(`${api}/verses/by_chapter/${ch}?per_page=50&page=${page}`)
    for (const v of r.verses) {
      if (pageStarts[v.page_number - 1] === undefined) pageStarts[v.page_number - 1] = v.id - 1
    }
    if (!r.pagination.next_page) break
    page = r.pagination.next_page
  }
}

const fixture = {
  source: `${api} (fetched ${new Date().toISOString().slice(0, 10)})`,
  juz,
  quarters,
  pages: pageStarts,
}
await mkdir(path.join(root, 'tests', 'fixtures'), { recursive: true })
await writeFile(
  path.join(root, 'tests', 'fixtures', 'qurancom-boundaries.json'),
  JSON.stringify(fixture, null, 1) + '\n',
)

const ours = JSON.parse(await readFile(path.join(root, 'src', 'data', 'quran-hafs.json'), 'utf8'))
let problems = 0
for (const key of ['juz', 'quarters', 'pages']) {
  const a = ours[key]
  const b = fixture[key]
  if (a.length !== b.length) {
    console.error(`${key}: ${a.length} in Tanzil vs ${b.length} on quran.com`)
    problems++
    continue
  }
  let bad = 0
  a.forEach((v, i) => {
    if (v !== b[i]) {
      console.error(`${key} #${i + 1}: ours starts at ayah index ${v}, quran.com at ${b[i]}`)
      bad++
    }
  })
  problems += bad
  if (!bad) console.log(`${key}: all ${a.length} boundaries agree`)
}
process.exit(problems ? 1 : 0)
