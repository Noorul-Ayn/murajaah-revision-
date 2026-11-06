import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { verseLabel } from '../i18n/labels'
import { itemsInScope, type ItemId, type Mode } from '../lib/items'
import { scopeMask, type Scope } from '../lib/scope'
import { buildQuestion, pickItems, seededRng, type Order, type Question } from '../lib/session'
import { leadingWords, splitWords } from '../lib/text'
import { QUARTER_COUNT } from '../lib/quran'
import type { Grade3 } from '../lib/srs'
import { Ayahs, PromptWords } from '../components/QuranText'
import { Summary, type Result } from './Summary'
import { CloseIcon, MicIcon } from '../components/Icons'
import { RecitationBoard } from '../components/RecitationBoard'
import { Dialog } from '../components/controls'
import { speechSupported, useSpeech } from '../hooks/useSpeech'
import { buildExpected, follow, suggestGrade, words as heardWords, type Expected } from '../lib/recitation'
import { loadSimpleText } from '../lib/simple'
import { primeAudio, warn } from '../lib/sound'
import { getKv, setKv } from '../storage/db'
import { useFocusMode } from '../app/focus'

export type QuizRequest = { mode: Mode; scope: Scope; size: number; order: Order } | { mode: Mode; itemIds: ItemId[] }

/** A missed item comes back this many questions later, once per session. */
const REQUEUE_GAP = 4
/** Words shown when naming a rub'. */
const NAME_PROMPT_WORDS = 6

function isRequest(v: unknown): v is QuizRequest {
  return typeof v === 'object' && v !== null && 'mode' in v && ('scope' in v || 'itemIds' in v)
}

export function Quiz() {
  const location = useLocation()
  const request = location.state as unknown
  if (!isRequest(request)) return <Navigate to="/" replace />
  // A new key restarts the session when "practice again" starts another one.
  return <QuizSession key={location.key} request={request} />
}

function QuizSession({ request }: { request: QuizRequest }) {
  const { quran, settings, states, recordAnswer } = useApp()
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
            itemsInScope(request.mode, mask, quran),
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
  const [recite, setRecite] = useState<{ expected: Expected[]; prompt: number } | null>(null)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const warned = useRef(new Set<number>())

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

  const grade = useCallback(
    async (g: Grade3) => {
      if (!question || busy) return
      setBusy(true)
      try {
        await recordAnswer(question.itemId, g, question.mode)
      } finally {
        setBusy(false)
      }
      setResults((r) => [...r, { itemId: question.itemId, grade: g }])
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
    },
    [question, busy, recordAnswer, requeued, pos, speech],
  )

  // Ayah mode: prompt words and the hint cap.
  const ayahPrompt = useMemo(() => {
    if (question?.mode !== 'ayah') return null
    const base = leadingWords(quran.text(question.index), settings.promptWords).shown.length
    const total = splitWords(quran.text(question.index)).words.length
    const shown = Math.min(base + extraWords, total)
    return { shown, total }
  }, [question, quran, settings.promptWords, extraWords])
  const usedWordHint = extraWords > 0

  const heard = useMemo(
    () => heardWords(`${speech.finalText} ${speech.interimText}`),
    [speech.finalText, speech.interimText],
  )
  const followed = useMemo(
    () => (recite ? follow(recite.expected, heard, speech.interimText.length > 0) : null),
    [recite, heard, speech.interimText],
  )

  // Warn once per slip, and reveal the answer when the recitation is complete.
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

  // A recitation followed to the end reveals the answer by itself.
  const revealed = revealedByUser || followed?.done === true

  const canListen = question !== null && question.mode !== 'name' && speechSupported()

  const startListening = async () => {
    if (!question || question.mode === 'name') return
    primeAudio()
    if (!(await getKv<boolean>('speechNotice'))) {
      setNoticeOpen(true)
      return
    }
    warned.current.clear()
    speech.start()
    const simple = await loadSimpleText()
    const prompt = question.mode === 'ayah' ? ayahPrompt!.shown : 0
    setRecite({
      expected: buildExpected(
        question.reveal,
        (i) => quran.text(i),
        (i) => simple[i]!,
        prompt,
      ),
      prompt,
    })
  }

  const revealNow = () => {
    speech.stop()
    setRevealed(true)
  }

  let suggested: Grade3 | null = followed?.done ? suggestGrade(followed.slips.size) : null
  if (suggested === 'perfect' && usedWordHint) suggested = 'hesitated'

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

  const nextAfterChoice = () => {
    if (question?.mode !== 'name' || choice === null) return
    const g: Grade3 = choice === question.quarter ? 'perfect' : 'missed'
    setResults((r) => [...r, { itemId: question.itemId, grade: g }])
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
  }

  // Keyboard: Space/Enter reveals, H shows another word, 1–3 grade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!question || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.closest('button, input, select, textarea, a, dialog')) return
      if (question.mode === 'name') {
        if (choice !== null && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          nextAfterChoice()
        }
        return
      }
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        revealNow()
      } else if (!revealed && question.mode === 'ayah' && e.key.toLowerCase() === 'h') {
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

  let ask = ''
  let board: ReactNode = null
  let hints: ReactNode = null

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
                indices={question.reveal}
                expected={recite.expected}
                result={followed}
                promptWords={recite.prompt}
                complete={revealed}
              />
              {revealed && where(question.index)}
            </>
          ) : revealed ? (
            <>
              <Ayahs indices={question.reveal} alreadyShown={ayahPrompt!.shown} animate />
              {where(question.index)}
            </>
          ) : (
            <PromptWords index={question.index} shown={ayahPrompt!.shown} />
          )}
        </>
      )
      if (!revealed && !recite) {
        const hidden = ayahPrompt!.total - ayahPrompt!.shown
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
                indices={question.reveal}
                expected={recite.expected}
                result={followed}
                promptWords={0}
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
                indices={question.reveal}
                expected={recite.expected}
                result={followed}
                promptWords={0}
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

  return (
    <div className="quiz">
      <div className="quiz__bar">
        <button
          type="button"
          className="btn btn--quiet"
          aria-label={t.quiz.end}
          title={t.quiz.end}
          onClick={() => {
            speech.stop()
            if (results.length) setQueue((q) => q.slice(0, pos))
            else navigate('/')
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

      {hints && <div className="quiz__hints">{hints}</div>}

      <div className="quiz__actions">
        {question.mode === 'name' ? (
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
            {followed?.done && (
              <p className="note" role="status">
                {followed.slips.size === 0
                  ? t.listen.done
                  : t.listen.doneWithSlips(t.listen.mistakes(followed.slips.size, num(followed.slips.size)))}
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
                          : t.listen.listening}
              </p>
            )}
            <div className={canListen ? 'listen-row' : undefined}>
              {canListen &&
                (speech.listening ? (
                  <button type="button" className="btn btn--large" onClick={() => speech.stop()}>
                    <span className="dot dot--live" aria-hidden="true" />
                    {t.listen.stop}
                  </button>
                ) : (
                  <button type="button" className="btn btn--large" onClick={() => void startListening()}>
                    <MicIcon />
                    {t.listen.start}
                  </button>
                ))}
              <button
                type="button"
                className="btn btn--primary btn--large btn--block"
                onClick={revealNow}
                aria-keyshortcuts="Space"
              >
                {t.quiz.reveal}
              </button>
            </div>
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
      </Dialog>
    </div>
  )
}
