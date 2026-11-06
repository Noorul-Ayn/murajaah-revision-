import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { verseLabel } from '../i18n/labels'
import { ayahItem, itemsInScope, MIN_AYAH_WORDS, pairItem, type ItemId, type Mode } from '../lib/items'
import { scopeMask, type Scope } from '../lib/scope'
import { buildQuestion, pickItems, seededRng, type Order, type Question } from '../lib/session'
import { leadingWords, openingText, splitWords, wordCount } from '../lib/text'
import { QUARTER_COUNT } from '../lib/quran'
import type { Grade3 } from '../lib/srs'
import { Ayahs, PromptWords } from '../components/QuranText'
import { Summary, type Result } from './Summary'
import { CloseIcon, MicIcon } from '../components/Icons'
import { RecitationBoard } from '../components/RecitationBoard'
import { Burst } from '../components/Burst'
import { GradeIcon } from '../components/Art'
import { Dialog } from '../components/controls'
import { speechSupported, useSpeech } from '../hooks/useSpeech'
import { buildExpected, follow, suggestGrade, words as heardWords, type Expected } from '../lib/recitation'
import { loadSimpleText } from '../lib/simple'
import { primeAudio, warn } from '../lib/sound'
import { getKv, setKv } from '../storage/db'
import { useFocusMode } from '../app/focus'
import { PageSpread } from '../components/PageSpread'
import { Mixups } from '../components/Mixups'
import { isRightPage, type Spot } from '../lib/layout'
import { ayahDiff, mixupsIn, sharedOpening, wordIndexFor } from '../lib/similar'
import { loadTranslation, type Translation } from '../lib/translations'
import { PRIVACY_PATH, reportUrl } from '../lib/report'

export type QuizRequest = { mode: Mode; scope: Scope; size: number; order: Order } | { mode: Mode; itemIds: ItemId[] }

/** A missed item comes back this many questions later, once per session. */
const REQUEUE_GAP = 4
/** Words shown when naming a rub'. */
const NAME_PROMPT_WORDS = 6
/** How far past the question's verse the app keeps following a recitation. */
const CONTINUE_AYAHS = 30

function isRequest(v: unknown): v is QuizRequest {
  return typeof v === 'object' && v !== null && 'mode' in v && ('scope' in v || 'itemIds' in v)
}

export function Quiz() {
  const location = useLocation()
  const request = location.state as unknown
  if (!isRequest(request)) return <Navigate to="/practice" replace />
  // A new key restarts the session when "practice again" starts another one.
  return <QuizSession key={location.key} request={request} />
}

function QuizSession({ request }: { request: QuizRequest }) {
  const { quran, layout, settings, states, recordAnswer } = useApp()
  const i18n = useI18n()
  const { t, num } = i18n
  const navigate = useNavigate()

  const [setup] = useState(() => {
    const mask = scopeMask('scope' in request ? request.scope : settings.memorized, quran)
    const quartersInScope = new Set<number>()
    for (let q = 1; q <= QUARTER_COUNT; q++) if (mask[quran.quarterStart(q)]) quartersInScope.add(q)
    const queue =
      'itemIds' in request
        ? request.itemIds
        : pickItems(
            itemsInScope(request.mode, mask, quran, states.keys()),
            states,
            request.order,
            request.size,
            Date.now(),
            Math.random,
          )
    return { queue, quartersInScope, seed: Math.floor(Math.random() * 2 ** 31) }
  })

  const [queue, setQueue] = useState<ItemId[]>(setup.queue)
  const [pos, setPos] = useState(0)
  const [revealedByUser, setRevealed] = useState(false)
  const [extraWords, setExtraWords] = useState(0)
  const [hintShown, setHintShown] = useState(false)
  const [choice, setChoice] = useState<number | 'unknown' | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [requeued] = useState(() => new Set<ItemId>())
  const [busy, setBusy] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Reciting aloud.
  const speech = useSpeech()
  /**
   * The recitation being followed: the question's own words (`targetCount`
   * expected positions), then the ayahs after it, so the reciter can keep
   * going past the verse until they move on.
   */
  const [recite, setRecite] = useState<{ expected: Expected[]; prompt: number; targetCount: number } | null>(null)
  /** Keep the microphone on from one question to the next. */
  const [voice, setVoice] = useState(false)
  /** Bumped on each perfect answer, to play a little burst of stars. */
  const [burst, setBurst] = useState(0)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const warned = useRef(new Set<number>())

  // Where on the page: the line tapped, and how the answer went once checked.
  const [spot, setSpot] = useState<Spot | null>(null)
  const [placed, setPlaced] = useState<{ raw: Grade3; grade: Grade3 } | null>(null)
  // From the meaning.
  const [translation, setTranslation] = useState<Translation | null>(null)
  const [translationFailed, setTranslationFailed] = useState(false)
  // Plain-spelling text: for following a recitation, finding mix-ups and comparing similar ayahs.
  const [simple, setSimple] = useState<readonly string[] | null>(null)
  /** Mix-ups the reciter said weren't (by the ayah they were reciting). */
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(() => new Set())

  const itemId = queue[pos]
  const question: Question | null = useMemo(
    () =>
      itemId
        ? buildQuestion(
            quran,
            itemId,
            { extraAyahs: settings.extraAyahs, quartersInScope: setup.quartersInScope },
            // Seeded by position, so a requeued item gets new answer choices.
            seededRng(setup.seed + pos),
          )
        : null,
    [quran, itemId, pos, settings.extraAyahs, setup],
  )

  useEffect(() => {
    headingRef.current?.focus()
  }, [pos])

  const finished = !question
  useFocusMode(!finished)

  /** Records the answer (and any ayahs recited after it) and moves on. */
  const advance = useCallback(
    async (
      g: Grade3,
      keepVoice: boolean,
      extra: readonly { itemId: ItemId; grade: Grade3 }[],
      pairs: readonly { itemId: ItemId; grade: Grade3 }[],
    ) => {
      if (!question || busy) return
      setBusy(true)
      try {
        await recordAnswer(question.itemId, g, question.mode)
        for (const c of extra) await recordAnswer(c.itemId, c.grade, 'ayah')
        for (const c of pairs) await recordAnswer(c.itemId, c.grade, 'pair')
      } finally {
        setBusy(false)
      }
      setResults((r) => [...r, { itemId: question.itemId, grade: g }, ...extra, ...pairs])
      if (g === 'perfect') setBurst((b) => b + 1)
      if (!keepVoice) setVoice(false)
      if (g === 'missed' && !requeued.has(question.itemId)) {
        requeued.add(question.itemId)
        setQueue((q) => {
          const next = [...q]
          next.splice(Math.min(pos + 1 + REQUEUE_GAP, next.length), 0, question.itemId)
          return next
        })
      }
      speech.stop()
      setRecite(null)
      warned.current.clear()
      setPos((p) => p + 1)
      setRevealed(false)
      setExtraWords(0)
      setHintShown(false)
      setChoice(null)
      setDismissed(new Set())
    },
    [question, busy, recordAnswer, requeued, pos, speech],
  )

  // The plain text, loaded when a pair needs it (reciting aloud loads it too).
  const needsSimple = question?.mode === 'pair'
  useEffect(() => {
    if (!needsSimple || simple) return
    let live = true
    void loadSimpleText().then((s) => {
      if (live) setSimple(s)
    })
    return () => {
      live = false
    }
  }, [needsSimple, simple])

  // The translation, for the meaning quiz.
  const needsTranslation = question?.mode === 'meaning'
  useEffect(() => {
    if (!needsTranslation) return
    let live = true
    loadTranslation(settings.translation).then(
      (tr) => live && setTranslation(tr),
      () => live && setTranslationFailed(true),
    )
    return () => {
      live = false
    }
  }, [needsTranslation, settings.translation])

  /**
   * Words of the ayah shown before reciting: its opening (continue the ayah),
   * nothing (from the meaning), or the opening it shares with its look-alike
   * (a pair), plus any words asked for as hints.
   */
  const prompt = useMemo(() => {
    if (question?.mode !== 'ayah' && question?.mode !== 'meaning' && question?.mode !== 'pair') return null
    const text = quran.text(question.index)
    const total = splitWords(text).words.length
    let base = question.mode === 'meaning' ? 0 : leadingWords(text, settings.promptWords).shown.length
    if (question.mode === 'pair' && simple) {
      const shared = sharedOpening(
        { uthmani: text, simple: simple[question.index]! },
        { simple: simple[question.other]! },
      )
      base = Math.min(Math.max(base, shared), total - 1)
    }
    return { shown: Math.min(base + extraWords, total), total }
  }, [question, quran, settings.promptWords, extraWords, simple])
  const usedWordHint = extraWords > 0

  const pairDiff = useMemo(() => {
    if (question?.mode !== 'pair' || !simple) return null
    return ayahDiff(
      { uthmani: quran.text(question.index), simple: simple[question.index]! },
      { uthmani: quran.text(question.other), simple: simple[question.other]! },
    )
  }, [question, quran, simple])

  const heard = useMemo(
    () => heardWords(`${speech.finalText} ${speech.interimText}`),
    [speech.finalText, speech.interimText],
  )
  const followed = useMemo(
    () => (recite ? follow(recite.expected, heard, speech.interimText.length > 0) : null),
    [recite, heard, speech.interimText],
  )

  // How the question's own words went, and which later ayahs were recited in full.
  const recited = useMemo(() => {
    if (!recite || !followed) return null
    const { expected, targetCount } = recite
    let targetSlips = 0
    for (const p of followed.slips.keys()) if (p < targetCount) targetSlips++
    const ayahs: { index: number; slips: number }[] = []
    for (let p = targetCount; p < followed.next; p++) {
      const e = expected[p]!
      const last = ayahs[ayahs.length - 1]
      if (!last || last.index !== e.ayah) ayahs.push({ index: e.ayah, slips: 0 })
      if (followed.slips.has(p)) ayahs[ayahs.length - 1]!.slips++
    }
    // Only ayahs said to the end count.
    const lastPos = expected.findLastIndex((e) => e.ayah === ayahs[ayahs.length - 1]?.index)
    if (ayahs.length && lastPos >= followed.next) ayahs.pop()
    return { targetDone: followed.next >= targetCount, targetSlips, ayahs }
  }, [recite, followed])

  /** Ayahs recited in full after the question's own words, graded from their slips. */
  const continuation = useMemo(
    () =>
      (recited?.ayahs ?? [])
        .filter((a) => wordCount(quran.text(a.index)) >= MIN_AYAH_WORDS)
        .map((a) => ({ itemId: ayahItem(quran, a.index), grade: suggestGrade(a.slips) })),
    [recited, quran],
  )
  /**
   * Similar ayahs the recitation drifted into, found from the words said
   * after a slip. Saved as pairs to practise when moving on, unless dismissed.
   */
  const wordIndex = useMemo(() => (simple ? wordIndexFor(simple) : null), [simple])
  const mixups = useMemo(() => {
    if (!recite || !followed || !wordIndex) return []
    return mixupsIn(wordIndex, recite.expected, heard, followed.strays).filter(
      (m) =>
        !dismissed.has(m.ayah) &&
        !(question?.mode === 'pair' && m.ayah === question.index && m.other === question.other),
    )
  }, [recite, followed, wordIndex, heard, dismissed, question])
  const pairs = useMemo(
    () => mixups.map((m) => ({ itemId: pairItem(quran, m.ayah, m.other), grade: 'missed' as Grade3 })),
    [mixups, quran],
  )

  const grade = useCallback((g: Grade3) => advance(g, false, continuation, pairs), [advance, continuation, pairs])

  // Warn once per slip; stop at the end of what can be followed.
  const { listening, stop: stopListening } = speech
  useEffect(() => {
    if (!followed || !listening) return
    let fresh = false
    for (const p of followed.slips.keys()) {
      if (!warned.current.has(p)) {
        warned.current.add(p)
        fresh = true
      }
    }
    if (fresh) warn({ sound: settings.listenSound, vibrate: settings.listenVibrate })
    if (followed.done) stopListening()
  }, [followed, listening, stopListening, settings.listenSound, settings.listenVibrate])

  // A recitation followed to the very end reveals the answer by itself.
  const revealed = revealedByUser || followed?.done === true

  const recitable = question !== null && question.mode !== 'name' && question.mode !== 'place'
  const canListen = recitable && speechSupported()

  const startListening = useCallback(async () => {
    if (!question || question.mode === 'name' || question.mode === 'place') return
    primeAudio()
    if (!(await getKv<boolean>('speechNotice'))) {
      setNoticeOpen(true)
      return
    }
    warned.current.clear()
    setVoice(true)
    speech.start()
    const plainText = await loadSimpleText()
    setSimple(plainText)
    const promptWords = prompt?.shown ?? 0
    const target = question.reveal
    const lastTarget = target[target.length - 1]!
    const surahEnd = quran.surahRange(quran.surahOf(lastTarget).n)[1]
    const following = Array.from(
      { length: Math.min(CONTINUE_AYAHS, surahEnd - lastTarget) },
      (_, k) => lastTarget + 1 + k,
    )
    const text = (i: number) => quran.text(i)
    const plain = (i: number) => plainText[i]!
    setRecite({
      expected: buildExpected([...target, ...following], text, plain, promptWords),
      prompt: promptWords,
      targetCount: buildExpected(target, text, plain, promptWords).length,
    })
  }, [question, speech, prompt, quran])

  // In voice mode, start listening by itself when the next question comes up.
  const autoStarted = useRef(-1)
  useEffect(() => {
    if (!voice || !recitable || autoStarted.current === pos) return
    if (recite || listening) return
    const id = window.setTimeout(() => {
      autoStarted.current = pos
      void startListening()
    }, 0)
    return () => window.clearTimeout(id)
  }, [voice, recitable, pos, recite, listening, startListening])

  const revealNow = () => {
    speech.stop()
    setRevealed(true)
  }

  let suggested: Grade3 | null = recited?.targetDone ? suggestGrade(recited.targetSlips) : null
  if (suggested === 'perfect' && usedWordHint) suggested = 'hesitated'

  /** Next question in voice mode: grades are taken from what was heard. */
  const nextQuestion = () => void advance(suggested ?? 'missed', true, continuation, pairs)

  const chooseQuarter = async (c: number | 'unknown') => {
    if (question?.mode !== 'name' || choice !== null) return
    setChoice(c)
    setBusy(true)
    try {
      await recordAnswer(question.itemId, c === question.quarter ? 'perfect' : 'missed', 'name')
    } finally {
      setBusy(false)
    }
  }

  const checkPlace = async (s: Spot | 'unknown') => {
    if (question?.mode !== 'place' || placed) return
    const raw: Grade3 = s === 'unknown' ? 'missed' : layout.grade(question.index, s)
    // Seeing the surah titles is a hint: the best it can be is Almost.
    const g: Grade3 = raw === 'perfect' && hintShown ? 'hesitated' : raw
    setPlaced({ raw, grade: g })
    setBusy(true)
    try {
      await recordAnswer(question.itemId, g, 'place')
    } finally {
      setBusy(false)
    }
  }

  const nextAfterChoice = () => {
    if (!question) return
    let g: Grade3
    if (question.mode === 'name' && choice !== null) g = choice === question.quarter ? 'perfect' : 'missed'
    else if (question.mode === 'place' && placed) g = placed.grade
    else return
    setResults((r) => [...r, { itemId: question.itemId, grade: g }])
    if (g === 'perfect') setBurst((b) => b + 1)
    if (g === 'missed' && !requeued.has(question.itemId)) {
      requeued.add(question.itemId)
      setQueue((q) => {
        const next = [...q]
        next.splice(Math.min(pos + 1 + REQUEUE_GAP, next.length), 0, question.itemId)
        return next
      })
    }
    setPos((p) => p + 1)
    setChoice(null)
    setSpot(null)
    setPlaced(null)
    setHintShown(false)
  }

  // Keyboard: Space/Enter reveals, H shows another word, 1–3 grade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!question || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.closest('button, input, select, textarea, a, dialog')) return
      if (question.mode === 'name' || question.mode === 'place') {
        const answered = question.mode === 'name' ? choice !== null : placed !== null
        if (answered && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          nextAfterChoice()
        } else if (question.mode === 'place' && !answered && spot && e.key === 'Enter') {
          e.preventDefault()
          void checkPlace(spot)
        }
        return
      }
      if (listening && e.key === 'Enter') {
        e.preventDefault()
        nextQuestion()
      } else if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        revealNow()
      } else if (!revealed && prompt && e.key.toLowerCase() === 'h') {
        setExtraWords((n) => n + 1)
      } else if (revealed && ['1', '2', '3'].includes(e.key)) {
        const g = (['missed', 'hesitated', 'perfect'] as const)[Number(e.key) - 1]!
        if (g === 'perfect' && usedWordHint) return
        void grade(g)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (finished) {
    return <Summary results={results} />
  }

  const total = queue.length
  const where = (index: number) => (
    <div className="where">
      <span>{verseLabel(i18n, quran, index)}</span>
      <span>{i18n.quarterLabel(quran.quarterOf(index))}</span>
      <span>{t.where.juz(num(quran.juzOf(index)))}</span>
      <span>{t.where.page(num(quran.pageOf(index)))}</span>
    </div>
  )

  /**
   * Which ayahs the recitation board shows: the question's own while it is
   * being recited, then the ayah being recited (with the one before it), and
   * after the answer is revealed, everything that was recited.
   */
  const boardView = (target: readonly number[]): { indices: number[]; promptWords: number } => {
    const prompt = recite?.prompt ?? 0
    if (!recite || !followed) return { indices: [...target], promptWords: prompt }
    const first = target[0]!
    const lastTarget = target[target.length - 1]!
    const pos = Math.min(followed.next, recite.expected.length - 1)
    const current = recite.expected[pos]!.ayah
    const beyond = followed.next > recite.targetCount && current > lastTarget
    if (revealed) {
      const upto = beyond ? current : lastTarget
      return { indices: Array.from({ length: upto - first + 1 }, (_, k) => first + k), promptWords: prompt }
    }
    if (!beyond) return { indices: [...target], promptWords: prompt }
    return { indices: [current - 1, current], promptWords: current - 1 === first ? prompt : 0 }
  }

  let ask = ''
  let board: ReactNode = null
  let afterBoard: ReactNode = null
  let hints: ReactNode = null
  const wordHint = (
    <button
      type="button"
      className="btn"
      disabled={!prompt || prompt.total - prompt.shown <= 0}
      onClick={() => setExtraWords((n) => n + 1)}
    >
      {t.quiz.nextWord}
    </button>
  )
  const recitationBoard = (target: readonly number[], basmala = false) =>
    recite && followed ? (
      <RecitationBoard
        {...boardView(target)}
        expected={recite.expected}
        result={followed}
        complete={revealed}
        basmala={basmala}
      />
    ) : null

  switch (question.mode) {
    case 'ayah': {
      ask =
        settings.extraAyahs > 0
          ? t.quiz.reciteRestAnd(settings.extraAyahs, num(settings.extraAyahs))
          : t.quiz.reciteRest
      const label = hintShown && !revealed ? i18n.surahName(quran.surahOf(question.index)) : null
      board = (
        <>
          {label && <p className="lawh__label">{label}</p>}
          {recite && followed ? (
            <>
              <RecitationBoard
                {...boardView(question.reveal)}
                expected={recite.expected}
                result={followed}
                complete={revealed}
              />
              {revealed && where(question.index)}
            </>
          ) : revealed ? (
            <>
              <Ayahs indices={question.reveal} alreadyShown={prompt!.shown} animate />
              {where(question.index)}
            </>
          ) : (
            <PromptWords index={question.index} shown={prompt!.shown} />
          )}
        </>
      )
      if (!revealed && !recite) {
        const hidden = prompt!.total - prompt!.shown
        hints = (
          <>
            <button type="button" className="btn" disabled={hidden <= 0} onClick={() => setExtraWords((n) => n + 1)}>
              {t.quiz.nextWord}
            </button>
            {!hintShown && (
              <button type="button" className="btn" onClick={() => setHintShown(true)}>
                {t.quiz.showSurah}
              </button>
            )}
          </>
        )
      }
      break
    }
    case 'open': {
      ask = t.quiz.reciteOpening
      const first = question.reveal[0]!
      board = (
        <>
          <p className="lawh__label">{t.where.juz(num(Math.ceil(question.quarter / 8)))}</p>
          <p className="quiz__ask" style={{ fontSize: 'var(--step-3)' }}>
            {i18n.quarterLabel(question.quarter)}
          </p>
          {hintShown && !revealed && <p className="note">{i18n.surahName(quran.surahOf(first))}</p>}
          {recite && followed ? (
            <>
              <RecitationBoard
                {...boardView(question.reveal)}
                expected={recite.expected}
                result={followed}
                complete={revealed}
                basmala
              />
              {revealed && where(first)}
            </>
          ) : (
            revealed && (
              <>
                <Ayahs indices={question.reveal} animate basmala />
                {where(first)}
              </>
            )
          )}
        </>
      )
      if (!revealed && !hintShown) {
        hints = (
          <button type="button" className="btn" onClick={() => setHintShown(true)}>
            {t.quiz.showSurah}
          </button>
        )
      }
      break
    }
    case 'link': {
      ask = t.quiz.whatNext
      board = (
        <>
          {hintShown && !revealed && <p className="lawh__label">{i18n.quarterLabel(question.quarter)}</p>}
          <Ayahs indices={[question.previous]} className={revealed || recite ? 'quran--context' : undefined} />
          {recite && followed ? (
            <>
              <RecitationBoard
                {...boardView(question.reveal)}
                expected={recite.expected}
                result={followed}
                complete={revealed}
                basmala
              />
              {revealed && where(question.reveal[0]!)}
            </>
          ) : (
            revealed && (
              <>
                <Ayahs indices={question.reveal} animate basmala />
                {where(question.reveal[0]!)}
              </>
            )
          )}
        </>
      )
      if (!revealed && !hintShown) {
        hints = (
          <button type="button" className="btn" onClick={() => setHintShown(true)}>
            {t.quiz.showRub}
          </button>
        )
      }
      break
    }
    case 'meaning': {
      ask = t.quiz.meaning.ask
      const meaning = translation?.ayahs[question.index]
      board = (
        <>
          <p className="lawh__label">{i18n.surahName(quran.surahOf(question.index))}</p>
          <div className="meaning">
            <p className="meaning__label">{t.quiz.meaning.label}</p>
            <p className="meaning__text" lang="en" dir="ltr">
              {meaning ?? (translationFailed ? t.quiz.meaning.failed : t.quiz.meaning.loading)}
            </p>
          </div>
          {recitationBoard(question.reveal) ??
            (revealed ? (
              <Ayahs indices={question.reveal} alreadyShown={prompt!.shown} animate />
            ) : (
              prompt!.shown > 0 && <PromptWords index={question.index} shown={prompt!.shown} />
            ))}
          {revealed && where(question.index)}
          {translation && <p className="meaning__credit">{t.quiz.meaning.credit(translation.name)}</p>}
        </>
      )
      if (!revealed && !recite) hints = wordHint
      break
    }
    case 'pair': {
      ask = t.quiz.pair.ask
      const otherRef = verseLabel(i18n, quran, question.other)
      board = (
        <>
          <p className="lawh__label">{i18n.surahName(quran.surahOf(question.index))}</p>
          {!revealed && <p className="note">{t.quiz.pair.lookAlike(otherRef)}</p>}
          {recitationBoard(question.reveal) ??
            (revealed ? (
              <Ayahs
                indices={question.reveal}
                alreadyShown={prompt!.shown}
                animate
                marked={(_, w) => pairDiff?.a[w] ?? false}
              />
            ) : (
              <PromptWords index={question.index} shown={prompt!.shown} />
            ))}
          {revealed && where(question.index)}
          {revealed && (
            <div className="pair-other">
              <p className="lawh__label">{t.quiz.pair.other(otherRef)}</p>
              <Ayahs indices={[question.other]} className="quran--context" marked={(_, w) => pairDiff?.b[w] ?? false} />
              <p className="note">{t.quiz.pair.diffNote}</p>
            </div>
          )}
        </>
      )
      if (!revealed && !recite) hints = wordHint
      break
    }
    case 'place': {
      ask = t.quiz.place.ask
      board = (
        <>
          <p className="lawh__label">{i18n.surahName(quran.surahOf(question.index))}</p>
          <p className="quran" lang="ar" dir="rtl" translate="no">
            {openingText(quran.text(question.index), 10)}
          </p>
          {placed && where(question.index)}
        </>
      )
      afterBoard = (
        <PageSpread
          index={question.index}
          picked={spot}
          onPick={placed ? undefined : setSpot}
          showShape={hintShown}
          answer={placed !== null}
        />
      )
      if (!placed && !hintShown) {
        hints = (
          <button type="button" className="btn" onClick={() => setHintShown(true)}>
            {t.quiz.place.showShape}
          </button>
        )
      }
      break
    }
    case 'name': {
      ask = t.quiz.whichRub
      const first = quran.quarterStart(question.quarter)
      board = (
        <>
          {choice === null ? (
            <PromptWords index={first} shown={leadingWords(quran.text(first), NAME_PROMPT_WORDS).shown.length} />
          ) : (
            <>
              <Ayahs indices={[first]} />
              {where(first)}
            </>
          )}
        </>
      )
      break
    }
  }

  const right = question.mode === 'name' && choice === question.quarter

  /** Where the ayah of a page question really begins, for the verdict. */
  const placeVerdict = () => {
    if (question.mode !== 'place' || !placed) return null
    const page = layout.quran.pageOf(question.index)
    const side = isRightPage(page) ? 'right' : 'left'
    const line = num(layout.firstLine(question.index))
    const text =
      placed.raw === 'perfect'
        ? t.quiz.place.exact
        : placed.raw === 'hesitated'
          ? t.quiz.place.close(side, line)
          : t.quiz.place.wrong(side, line)
    const cls =
      placed.raw === 'perfect' ? 'verdict--right' : placed.raw === 'hesitated' ? 'verdict--near' : 'verdict--wrong'
    const ref = verseLabel(i18n, quran, question.index)
    const report =
      placed.raw === 'perfect'
        ? null
        : reportUrl(`Page quiz: ${ref} (${settings.mushaf} print)`, [
            `Ayah: ${ref}`,
            `Mushaf print: ${settings.mushaf} AH`,
            `The app says: page ${page}, line ${layout.firstLine(question.index)}`,
            'In my mushaf it begins on: page …, line …',
          ])
    return (
      <>
        <p className={`verdict ${cls}`} role="status">
          {text}
        </p>
        {report && (
          <p className="note">
            <a href={report} target="_blank" rel="noreferrer">
              {t.quiz.place.report}
            </a>
          </p>
        )}
      </>
    )
  }

  return (
    <div className="quiz">
      {burst > 0 && <Burst key={burst} />}
      <div className="quiz__bar">
        <button
          type="button"
          className="btn btn--quiet"
          aria-label={t.quiz.end}
          title={t.quiz.end}
          onClick={() => {
            speech.stop()
            if (results.length) setQueue((q) => q.slice(0, pos))
            else navigate('/practice')
          }}
        >
          <CloseIcon />
        </button>
        <div className="meter" aria-hidden="true">
          <div style={{ width: `${(pos / total) * 100}%` }} />
        </div>
        <span className="quiz__counter">{t.quiz.counter(num(pos + 1), num(total))}</span>
      </div>

      <h1 ref={headingRef} tabIndex={-1} className="quiz__ask" style={{ fontSize: 'var(--step-0)', outline: 'none' }}>
        {ask}
      </h1>

      <div className="lawh" aria-live="polite">
        {board}
      </div>

      {afterBoard}

      <Mixups mixups={mixups} simple={simple} onDismiss={(a) => setDismissed((d) => new Set(d).add(a))} />

      {hints && <div className="quiz__hints">{hints}</div>}

      <div className="quiz__actions">
        {question.mode === 'place' ? (
          placed === null ? (
            <>
              {hintShown && <p className="note">{t.quiz.hintCap}</p>}
              <p className="note">{t.quiz.place.tap}</p>
              <div className="listen-row">
                <button type="button" className="btn btn--large" onClick={() => void checkPlace('unknown')}>
                  {t.quiz.dontKnow}
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--large btn--block"
                  disabled={!spot || busy}
                  onClick={() => spot && void checkPlace(spot)}
                >
                  {t.quiz.place.check}
                </button>
              </div>
            </>
          ) : (
            <>
              {placeVerdict()}
              <button
                type="button"
                className="btn btn--primary btn--large btn--block"
                onClick={nextAfterChoice}
                autoFocus
              >
                {t.quiz.next}
              </button>
            </>
          )
        ) : question.mode === 'name' ? (
          choice === null ? (
            <>
              <div className="choices">
                {question.choices.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="choice"
                    disabled={busy}
                    onClick={() => void chooseQuarter(q)}
                  >
                    {i18n.quarterLabel(q)}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn--quiet" onClick={() => void chooseQuarter('unknown')}>
                {t.quiz.dontKnow}
              </button>
            </>
          ) : (
            <>
              <div className="choices">
                {question.choices.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="choice"
                    disabled
                    data-state={q === question.quarter ? 'right' : q === choice ? 'wrong' : undefined}
                  >
                    {i18n.quarterLabel(q)}
                  </button>
                ))}
              </div>
              <p className={`verdict ${right ? 'verdict--right' : 'verdict--wrong'}`} role="status">
                {right ? t.quiz.correct : t.quiz.itWas(i18n.quarterLabel(question.quarter))}
              </p>
              <button
                type="button"
                className="btn btn--primary btn--large btn--block"
                onClick={nextAfterChoice}
                autoFocus
              >
                {t.quiz.next}
              </button>
            </>
          )
        ) : revealed ? (
          <>
            {recited?.targetDone && (
              <p className="note" role="status">
                {recited.targetSlips === 0
                  ? t.listen.done
                  : t.listen.doneWithSlips(t.listen.mistakes(recited.targetSlips, num(recited.targetSlips)))}
                {continuation.length > 0 && <> {t.listen.alsoRecited(continuation.length, num(continuation.length))}</>}
              </p>
            )}
            {usedWordHint && <p className="note">{t.quiz.hintCap}</p>}
            <div className="grades" role="group" aria-label={t.quiz.howDid}>
              {(['missed', 'hesitated', 'perfect'] as const).map((g, k) => (
                <button
                  key={g}
                  type="button"
                  className={`grade grade--${g}${suggested === g ? ' grade--suggested' : ''}`}
                  disabled={busy || (g === 'perfect' && usedWordHint)}
                  onClick={() => void grade(g)}
                  aria-keyshortcuts={String(k + 1)}
                  aria-description={suggested === g ? t.listen.suggested : undefined}
                >
                  <GradeIcon grade={g} />
                  {t.quiz.grades[g]}
                  {suggested === g && <span className="grade__tag">{t.listen.suggested}</span>}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {(speech.listening || speech.error) && (
              <p className="listen-status" role={speech.error ? 'alert' : 'status'}>
                {speech.listening && (
                  <span className={`dot ${followed?.stuck ? 'dot--bad' : 'dot--live'}`} aria-hidden="true" />
                )}
                {speech.error === 'denied'
                  ? t.listen.denied
                  : speech.error === 'network'
                    ? t.listen.network
                    : speech.error === 'no-speech'
                      ? t.listen.noSpeech
                      : speech.error
                        ? t.listen.failed
                        : followed?.stuck
                          ? t.listen.slipped
                          : recited?.targetDone
                            ? t.listen.keepGoing
                            : t.listen.listening}
              </p>
            )}
            {speech.listening ? (
              <div className="listen-row">
                <button
                  type="button"
                  className="btn btn--large"
                  onClick={() => {
                    setVoice(false)
                    revealNow()
                  }}
                >
                  <span className="dot dot--live" aria-hidden="true" />
                  {t.listen.stop}
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--large btn--block"
                  disabled={busy}
                  onClick={nextQuestion}
                  aria-keyshortcuts="Enter"
                >
                  {t.listen.next}
                </button>
              </div>
            ) : (
              <div className={canListen ? 'listen-row' : undefined}>
                {canListen && (
                  <button type="button" className="btn btn--large" onClick={() => void startListening()}>
                    <MicIcon />
                    {t.listen.start}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--primary btn--large btn--block"
                  onClick={revealNow}
                  aria-keyshortcuts="Space"
                >
                  {t.quiz.reveal}
                </button>
              </div>
            )}
            {!speech.listening && <p className="note keys-hint">{t.quiz.keys}</p>}
          </>
        )}
      </div>
      <Dialog
        open={noticeOpen}
        onClose={() => setNoticeOpen(false)}
        title={t.listen.noticeTitle}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setNoticeOpen(false)}>
              {t.settings.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={async () => {
                setNoticeOpen(false)
                await setKv('speechNotice', true)
                void startListening()
              }}
            >
              {t.listen.noticeOk}
            </button>
          </>
        }
      >
        <p>{t.listen.noticeBody}</p>
        <p className="muted">{t.listen.noticeLimits}</p>
        <p className="small">
          <a href={`#${PRIVACY_PATH}`} target="_blank" rel="noreferrer">
            {t.settings.privacy}
          </a>
        </p>
      </Dialog>
    </div>
  )
}
