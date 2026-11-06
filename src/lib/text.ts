/**
 * Word handling for the Tanzil Uthmani text.
 *
 * In the Tanzil text, pause (waqf) marks, the rub' al-hizb sign ۞ and the
 * sajda sign ۩ are written as separate space-delimited tokens. They are not
 * words, so they are attached to the word before them (or, at the start of an
 * ayah, kept apart) and never counted when the quiz shows "the first N words".
 */

export const RUB_SIGN = '۞'
export const SAJDA_SIGN = '۩'

/** Quranic annotation signs (U+06D6–U+06ED) that can stand alone as tokens. */
const SIGN_ONLY = /^[ۖ-ۭ]+$/u

export function isSignToken(token: string): boolean {
  return SIGN_ONLY.test(token)
}

export interface Words {
  /** A leading ۞ sign, if the ayah starts a rub'. */
  rubSign: boolean
  /** The words of the ayah; each may carry trailing pause or sajda signs. */
  words: string[]
}

export function splitWords(text: string): Words {
  const tokens = text.split(' ').filter(Boolean)
  let rubSign = false
  const words: string[] = []
  for (const token of tokens) {
    if (isSignToken(token)) {
      if (words.length === 0) {
        if (token.includes(RUB_SIGN)) rubSign = true
        continue
      }
      words[words.length - 1] += ` ${token}`
    } else {
      words.push(token)
    }
  }
  return { rubSign, words }
}

export function wordCount(text: string): number {
  return splitWords(text).words.length
}

/**
 * The first `n` words of an ayah, but never more than half of it, so a short
 * ayah isn't given away by its prompt. At least one word is always shown.
 */
export function leadingWords(text: string, n: number): { shown: string[]; hidden: number } {
  const { words } = splitWords(text)
  const count = Math.max(1, Math.min(n, Math.floor(words.length / 2)))
  return { shown: words.slice(0, count), hidden: words.length - count }
}

/** Up to `max` words from the start of an ayah, for labels and lists. */
export function openingText(text: string, max: number): string {
  const { words } = splitWords(text)
  return words.length > max ? `${words.slice(0, max).join(' ')} …` : words.join(' ')
}

/** Strips pause and sajda signs from a word, for compact labels. */
export function bareWord(word: string): string {
  return word
    .split(' ')
    .filter((t) => !isSignToken(t))
    .join(' ')
}
