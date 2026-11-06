/** Tanzil's plain-spelling text, loaded only when reciting aloud. */
let loading: Promise<string[]> | null = null

export function loadSimpleText(): Promise<string[]> {
  loading ??= import('../data/quran-simple.json').then((m) => (m.default as { ayahs: string[] }).ayahs)
  loading.catch(() => (loading = null))
  return loading
}
