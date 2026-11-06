/** English translations shown alongside the Arabic in the mushaf reader. */

export type TranslationId = 'en-sahih' | 'en-pickthall'

export interface TranslationInfo {
  id: TranslationId
  name: string
  translator: string
  year: number
}

export interface Translation extends TranslationInfo {
  terms: string
  source: string
  /** One entry per ayah, indexed like the Qur'an text (0–6235). */
  ayahs: string[]
}

export const TRANSLATIONS: readonly TranslationInfo[] = [
  { id: 'en-sahih', name: 'Saheeh International', translator: 'Saheeh International', year: 1997 },
  { id: 'en-pickthall', name: 'Pickthall', translator: 'Mohammed Marmaduke William Pickthall', year: 1930 },
]

const loaders: Record<TranslationId, () => Promise<{ default: unknown }>> = {
  'en-sahih': () => import('../data/translations/en-sahih.json'),
  'en-pickthall': () => import('../data/translations/en-pickthall.json'),
}

const cache = new Map<TranslationId, Promise<Translation>>()

/** Loads a translation once; each is a separate chunk, fetched only when needed. */
export function loadTranslation(id: TranslationId): Promise<Translation> {
  let p = cache.get(id)
  if (!p) {
    p = loaders[id]().then((m) => m.default as Translation)
    p.catch(() => cache.delete(id))
    cache.set(id, p)
  }
  return p
}
