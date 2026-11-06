#!/usr/bin/env node
// Builds src/data/translations/<id>.json from the Tanzil translation files in
// data/tanzil/trans/. The text is copied unchanged, one entry per ayah.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const quran = JSON.parse(await readFile(path.join(root, 'src', 'data', 'quran-hafs.json'), 'utf8'))

const translations = [
  {
    id: 'en-sahih',
    file: 'en.sahih.txt',
    name: 'Saheeh International',
    translator: 'Saheeh International',
    year: 1997,
    terms: 'Distributed by Tanzil.net for non-commercial use only.',
  },
  {
    id: 'en-pickthall',
    file: 'en.pickthall.txt',
    name: 'Pickthall',
    translator: 'Mohammed Marmaduke William Pickthall',
    year: 1930,
    terms: 'Public domain translation (1930), text from Tanzil.net.',
  },
]

await mkdir(path.join(root, 'src', 'data', 'translations'), { recursive: true })
for (const t of translations) {
  const raw = await readFile(path.join(root, 'data', 'tanzil', 'trans', t.file), 'utf8')
  const header = raw
    .split('\n')
    .filter((l) => l.startsWith('#'))
    .map((l) => l.replace(/^#\s?/, '').trim())
    .filter((l) => l && !/^-+$/.test(l))
  const lines = raw.split('\n').filter((l) => l && !l.startsWith('#'))
  if (lines.length !== quran.ayahs.length) throw new Error(`${t.file}: ${lines.length} lines, expected 6236`)
  const ayahs = lines.map((line, i) => {
    const [s, a, ...rest] = line.split('|')
    const surah = quran.surahs.findLast((x) => x.start <= i)
    if (Number(s) !== surah.n || Number(a) !== i - surah.start + 1) {
      throw new Error(`${t.file}: line ${i + 1} is ${s}:${a}, expected ${surah.n}:${i - surah.start + 1}`)
    }
    return rest.join('|').trim()
  })
  const { file: _file, ...meta } = t
  const out = { ...meta, source: 'https://tanzil.net/trans/', header, ayahs }
  await writeFile(path.join(root, 'src', 'data', 'translations', `${t.id}.json`), JSON.stringify(out) + '\n')
  console.log(`wrote src/data/translations/${t.id}.json (${ayahs.length} ayahs)`)
}
