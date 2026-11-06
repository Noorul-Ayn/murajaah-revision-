/** Folds text for search: ignores Arabic diacritics, forms of alif, case and punctuation. */
export function foldSearch(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]/g, '')
}
