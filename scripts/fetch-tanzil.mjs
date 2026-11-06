#!/usr/bin/env node
// Downloads the verbatim Tanzil Uthmani text and metadata into data/tanzil/.
// Run this only when you want to pick up an official Tanzil update, then run
// `npm run data:build` and `npm run data:check` and review the diff.
//
// Tanzil terms of use: the text may be copied verbatim but must not be changed,
// its source must be credited, and a link to https://tanzil.net must be shown.

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outDir = path.join(root, 'data', 'tanzil')

const files = {
  'quran-uthmani.xml':
    'https://tanzil.net/pub/download/index.php?marks=true&sajdah=true&rub=true&tatweel=true&quranType=uthmani&outType=xml&agree=true',
  'quran-data.xml': 'https://tanzil.net/res/text/metadata/quran-data.xml',
}

await mkdir(outDir, { recursive: true })
for (const [name, url] of Object.entries(files)) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  const body = await res.text()
  if (!body.startsWith('<?xml')) throw new Error(`${name}: response is not XML`)
  await writeFile(path.join(outDir, name), body)
  console.log(`saved data/tanzil/${name} (${body.length.toLocaleString()} chars)`)
}
