import { describe, expect, it } from 'vitest'
import { quran } from './helpers'
import simple from '../src/data/quran-simple.json'
import { splitWords } from '../src/lib/text'
import {
  alignWords,
  bareUthmani,
  buildExpected,
  follow,
  normalize,
  sameWord,
  suggestGrade,
  words,
} from '../src/lib/recitation'

const at = (s: number, a: number) => quran.indexOf(s, a)
const expectedFor = (indices: number[], startWord = 0) =>
  buildExpected(
    indices,
    (i) => quran.text(i),
    (i) => simple.ayahs[i]!,
    startWord,
  )

describe('normalizing Arabic', () => {
  it('ignores diacritics, alif forms, hamza seats and taa marbuta', () => {
    expect(normalize('ٱلْحَمْدُ')).toBe('الحمد')
    expect(normalize('إِلَٰهَ')).toBe(normalize('اله'))
    expect(normalize('الصلاة')).toBe('الصلاه')
    expect(normalize('السماء')).toBe('السما')
    expect(normalize('مؤمن')).toBe('مومن')
  })

  it('turns Uthmani small letters into full ones', () => {
    expect(bareUthmani('ٱلْكِتَـٰبُ')).toBe('الكتاب')
    expect(bareUthmani('إِبْرَٰهِـۧمَ')).toBe('ابراهيم')
  })

  it('tells close but different words apart', () => {
    expect(sameWord('يلد', 'يولد')).toBe(false)
    expect(sameWord('قال', 'قالوا')).toBe(false)
    expect(sameWord('المستقيم', 'المستقيم')).toBe(true)
    expect(sameWord('الرحمان', 'الرحمن')).toBe(true) // recognizer spelling, long word
  })
})

describe('aligning plain words to the mushaf', () => {
  it('maps يا أيها onto the single Uthmani word يَـٰٓأَيُّهَا', () => {
    const i = at(2, 21)
    const uw = splitWords(quran.text(i)).words
    const sw = simple.ayahs[i]!.split(' ')
    const map = alignWords(uw, sw)
    expect(sw.slice(0, 3)).toEqual(['يا', 'أيها', 'الناس'])
    expect(map.slice(0, 3)).toEqual([0, 0, 1])
    expect(map[map.length - 1]).toBe(uw.length - 1)
  })

  it('is one to one wherever the word counts agree', () => {
    for (const i of [0, 7, 261, 6230]) {
      const uw = splitWords(quran.text(i)).words
      const sw = simple.ayahs[i]!.split(' ')
      if (uw.length === sw.length) expect(alignWords(uw, sw)).toEqual(sw.map((_, k) => k))
    }
  })

  it('aligns every ayah monotonically, ending on its last word', { timeout: 60_000 }, () => {
    for (let i = 0; i < 6236; i++) {
      const uw = splitWords(quran.text(i)).words
      const map = alignWords(uw, simple.ayahs[i]!.split(' '))
      expect(map[map.length - 1]).toBe(uw.length - 1)
      map.forEach((v, k) => k && expect(v).toBeGreaterThanOrEqual(map[k - 1]!))
    }
  })
})

describe('following a recitation', () => {
  const ikhlas1 = expectedFor([at(112, 1)], 2) // after "قل هو": الله أحد
  const fatiha = expectedFor([0, 1, 2, 3, 4, 5, 6])

  it('counts the words already shown as said', () => {
    expect(ikhlas1.filter((e) => e.given).map((e) => e.norm)).toEqual(['قل', 'هو'])
    expect(ikhlas1.filter((e) => !e.given).map((e) => e.norm)).toEqual(['الله', 'احد'])
    expect(follow(ikhlas1, []).next).toBe(2)
  })

  it('lets the reciter start from the beginning of the ayah', () => {
    expect(follow(ikhlas1, words('قل'), true).slips.size).toBe(0)
    expect(follow(ikhlas1, words('قل')).slips.size).toBe(0)
    const f = follow(ikhlas1, words('قل هو الله أحد'))
    expect(f).toMatchObject({ done: true, stuck: false })
    expect(f.slips.size).toBe(0)
    const fatiha1 = expectedFor([0], 2) // "بسم الله" shown
    expect(follow(fatiha1, words('بسم الله الرحمن الرحيم')).slips.size).toBe(0)
  })

  it('lets the reciter go back over a stretch of the ayah', () => {
    const e = expectedFor([at(2, 2)], 2) // "ذلك الكتاب" shown
    const f = follow(e, words('لا ريب فيه ريب فيه هدى للمتقين'))
    expect(f.done).toBe(true)
    expect(f.slips.size).toBe(0)
    const again = follow(e, words('لا ريب فيه ذلك الكتاب لا ريب فيه هدى للمتقين'))
    expect(again.done).toBe(true)
    expect(again.slips.size).toBe(0)
  })

  it('finishes a correct recitation with no slips', () => {
    const f = follow(ikhlas1, words('الله أحد'))
    expect(f).toMatchObject({ done: true, stuck: false })
    expect(f.slips.size).toBe(0)
  })

  it('waits on a wrong word until it is corrected', () => {
    const e = expectedFor([at(112, 3)], 2) // after "لم يلد": ولم يولد
    // Positions 0–1 are the shown "لم يلد"; 2 is ولم, 3 is يولد.
    const wrong = follow(e, words('ولم يلد'))
    expect(wrong.stuck).toBe(true)
    expect(wrong.next).toBe(3)
    expect(wrong.slips.get(3)).toBe('wrong') // يلد is an earlier word, but saying it here is a slip
    const fixed = follow(e, words('ولم يلد يولد'))
    expect(fixed.done).toBe(true)
    expect(fixed.slips.get(3)).toBe('wrong') // the slip still counts
  })

  it('notices skipped words and picks up after them', () => {
    const f = follow(fatiha, words('بسم الله الرحمن الرحيم الحمد لله رب العالمين مالك يوم الدين'))
    expect(f.slips.get(8)).toBe('skipped') // الرحمن (1:3)
    expect(f.slips.get(9)).toBe('skipped') // الرحيم
    expect(f.next).toBe(13)
  })

  it('doesn’t count a repeated word or an unfinished last word as a mistake', () => {
    const f = follow(fatiha, words('بسم الله الله الرحمن الرحيم الحمد لل'), true)
    expect(f.slips.size).toBe(0)
    expect(f.next).toBe(5)
  })

  it('allows the isti’adha and basmala before reciting', () => {
    const e = expectedFor([at(2, 1), at(2, 2)])
    const f = follow(e, words('أعوذ بالله من الشيطان الرجيم بسم الله الرحمن الرحيم الم ذلك الكتاب'))
    expect(f.slips.size).toBe(0)
    expect(f.next).toBe(3)
    // …even while it is still being said.
    expect(follow(e, words('بسم الله')).slips.size).toBe(0)
  })

  it('flags a jump to a similar passage', () => {
    // 2:2 continued with words from elsewhere
    const e = expectedFor([at(2, 2)], 2) // لا ريب فيه هدى للمتقين
    const f = follow(e, words('لا ريب فيه من رب العالمين'))
    expect(f.stuck).toBe(true)
    expect(f.slips.get(5)).toBe('wrong') // هدى, after the two shown words and لا ريب فيه
  })

  it('suggests a grade from the number of slips', () => {
    expect(suggestGrade(0)).toBe('perfect')
    expect(suggestGrade(2)).toBe('hesitated')
    expect(suggestGrade(3)).toBe('missed')
  })
})
