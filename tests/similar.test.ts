import { describe, expect, it } from 'vitest'
import { quran } from './helpers'
import simple from '../src/data/quran-simple.json'
import { buildExpected, follow, words } from '../src/lib/recitation'
import { ayahDiff, buildWordIndex, commonSubsequence, findMixup, mixupsIn, sharedOpening } from '../src/lib/similar'
import { splitWords } from '../src/lib/text'
import { itemsInScope, pairItem, parseItem, pairOther, itemAyahIndex, isItemId } from '../src/lib/items'
import { scopeMask } from '../src/lib/scope'

const at = (s: number, a: number) => quran.indexOf(s, a)
const plain = (s: number, a: number) => simple.ayahs[at(s, a)]!
const index = buildWordIndex(simple.ayahs)
const both = (s: number, a: number) => ({ uthmani: quran.text(at(s, a)), simple: plain(s, a) })

/** Follows a recitation of `target` and returns the mix-ups found in it. */
function recite(target: [number, number], said: string) {
  const expected = buildExpected(
    [at(...target)],
    (i) => quran.text(i),
    (i) => simple.ayahs[i]!,
  )
  const heard = words(said)
  const f = follow(expected, heard)
  return mixupsIn(index, expected, heard, f.strays)
}

describe('finding where a recitation drifted', () => {
  it('2:58 drifting into the word order of 7:161', () => {
    const said = 'وإذ قلنا ادخلوا هذه القرية فكلوا منها حيث شئتم وقولوا حطة وادخلوا الباب سجدا'
    expect(recite([2, 58], said)).toEqual([{ ayah: at(2, 58), other: at(7, 161) }])
  })

  it('a single word from the other ayah, after three shared words (2:49 and 7:141)', () => {
    const said = 'وإذ نجيناكم من آل فرعون يسومونكم سوء العذاب يقتلون أبناءكم'
    expect(recite([2, 49], said)).toEqual([{ ayah: at(2, 49), other: at(7, 141) }])
  })

  it('7:19 drifting into 2:35', () => {
    const said = 'ويا آدم اسكن أنت وزوجك الجنة وكلا منها رغدا حيث شئتما'
    expect(recite([7, 19], said)).toEqual([{ ayah: at(7, 19), other: at(2, 35) }])
  })

  it('a common ending picks the ayah that also shares the words before it (3:126 and 8:10)', () => {
    const said = 'وما جعله الله إلا بشرى لكم ولتطمئن قلوبكم به وما النصر إلا من عند الله إن الله عزيز حكيم'
    expect(recite([3, 126], said)).toEqual([{ ayah: at(3, 126), other: at(8, 10) }])
  })

  it('a clean recitation, or one that only stumbles, finds nothing', () => {
    expect(recite([2, 58], plain(2, 58))).toEqual([])
    expect(recite([112, 1], 'قل هو الله الواحد')).toEqual([])
  })

  it('ignores a common phrase with nothing shared before it', () => {
    expect(findMixup(index, at(112, 4), ['احد', 'كفوا'], words('إن شاء الله'))).toBeNull()
  })

  it('ignores skipping to the next ayah and identical refrains', () => {
    // Al-Ikhlas: from ayah 2 straight into ayah 4 is skipping, not a look-alike.
    expect(recite([112, 2], 'الله الصمد ولم يكن له كفوا أحد')).toEqual([])
    // Ar-Rahman 13 and 16 are the same words.
    expect(findMixup(index, at(55, 13), ['فباي', 'الا', 'ربكما'], words('تكذبان'))).toBeNull()
  })

  it('still reports the mix-up after the reciter finds the way back', () => {
    // Drift into 7:161, then back to 2:58's own words to the end.
    const said = `وإذ قلنا ادخلوا هذه القرية فكلوا منها حيث شئتم وقولوا حطة رغدا وادخلوا الباب سجدا وقولوا حطة نغفر لكم خطاياكم وسنزيد المحسنين`
    expect(recite([2, 58], said)).toEqual([{ ayah: at(2, 58), other: at(7, 161) }])
  })
})

describe('showing where two ayahs differ', () => {
  it('finds the longest common subsequence', () => {
    const [a, b] = commonSubsequence(['a', 'b', 'c', 'd'], ['a', 'c', 'x', 'd'])
    expect(a).toEqual([true, false, true, true])
    expect(b).toEqual([true, true, false, true])
  })

  it('marks the differing display words of 2:49 and 7:141', () => {
    const d = ayahDiff(both(2, 49), both(7, 141))
    const shown = splitWords(quran.text(at(2, 49))).words
    const marked = shown.filter((_, k) => d.a[k])
    expect(marked.length).toBe(2) // نَجَّيْنَٰكُم and يُذَبِّحُونَ
    expect(d.a.length).toBe(shown.length)
    expect(d.b.filter(Boolean).length).toBe(2)
  })

  it('counts the shared opening in display words', () => {
    // "وَمَا جَعَلَهُ ٱللَّهُ إِلَّا بُشْرَىٰ" opens both 3:126 and 8:10.
    expect(sharedOpening(both(3, 126), both(8, 10))).toBe(5)
    expect(sharedOpening(both(2, 58), both(7, 161))).toBe(1)
    expect(sharedOpening(both(112, 1), both(2, 255))).toBe(0)
  })
})

describe('pair items', () => {
  it('round-trips and stays within the id length', () => {
    const id = pairItem(quran, at(26, 123), at(26, 141))
    expect(id).toBe('pair:26:123:26:141')
    expect(isItemId(id)).toBe(true)
    expect(parseItem(id)).toEqual({ mode: 'pair', surah: 26, ayah: 123, other: { surah: 26, ayah: 141 } })
    expect(itemAyahIndex(quran, id)).toBe(at(26, 123))
    expect(pairOther(quran, id)).toBe(at(26, 141))
    expect(isItemId('pair:2:58:2:58')).toBe(false)
    expect(isItemId('pair:2:58:7')).toBe(false)
  })

  it('come from what has been reviewed, within what is memorized', () => {
    const known = [pairItem(quran, at(7, 161), at(2, 58)), pairItem(quran, at(2, 58), at(7, 161)), 'ayah:1:2']
    const juz1 = scopeMask([{ kind: 'juz', n: 1 }], quran)
    expect(itemsInScope('pair', juz1, quran, known)).toEqual(['pair:2:58:7:161'])
  })
})
