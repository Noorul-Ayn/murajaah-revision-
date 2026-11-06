import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useApp } from '../app/AppContext'
import { useSync } from '../app/SyncContext'
import { useFocusMode } from '../app/focus'
import { useI18n } from '../i18n/I18n'
import { buildExpected, follow, words as heardWords, type Expected } from '../lib/recitation'
import { mixupsIn, wordIndexFor } from '../lib/similar'
import { pairItem } from '../lib/items'
import { Mixups } from '../components/Mixups'
import { cleanDays, cleanToday, RUNS_TO_UNLOCK, canRecord } from '../lib/runs'
import { loadSimpleText } from '../lib/simple'
import { primeAudio, warn } from '../lib/sound'
import { speechSupported, useSpeech } from '../hooks/useSpeech'
import { recorderSupported, useRecorder, type Take } from '../hooks/useRecorder'
import {
  addRun,
  deleteRecording,
  getAllRuns,
  getKv,
  getRecording,
  putRecording,
  setKv,
  type Recording,
  type Run,
} from '../storage/db'
import { Ayahs } from '../components/QuranText'
import { RecitationBoard } from '../components/RecitationBoard'
import { Dialog } from '../components/controls'
import { useToast } from '../components/Toast'
import { MicIcon } from '../components/Icons'

type Mode = 'idle' | 'run' | 'record'

interface Outcome {
  kind: 'run' | 'record'
  slips: number
  /** A clean run that added a new day. */
  newDay: boolean
  days: number
  take?: Take & { url: string; timings: number[] }
}

/** Seconds of speech before a word reaches the recognizer, taken off ayah start times. */
const LATENCY_MS = 1200

export function ReciteSurah() {
  const params = useParams()
  const n = Number(params.surah)
  if (!Number.isInteger(n) || n < 1 || n > 114) return <Navigate to="/recite" replace />
  return <ReciteSurahScreen key={n} surahNo={n} />
}

function ReciteSurahScreen({ surahNo }: { surahNo: number }) {
  const { quran, settings, recitations, touchRecitations, recordAnswer } = useApp()
  const sync = useSync()
  const i18n = useI18n()
  const { t, num } = i18n
  const toast = useToast()
  const navigate = useNavigate()
  const surah = quran.surah(surahNo)
  const indices = useMemo(() => Array.from({ length: surah.ayahs }, (_, k) => surah.start + k), [surah])

  const [runs, setRuns] = useState<Run[]>([])
  const [mine, setMine] = useState<{ rec: Recording; url: string } | null>(null)
  const [mode, setMode] = useState<Mode>('idle')
  const [expected, setExpected] = useState<Expected[] | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [notice, setNotice] = useState<Mode | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [startError, setBusyError] = useState<string | null>(null)
  const [openedAt] = useState(() => Date.now())
  const [simple, setSimple] = useState<readonly string[] | null>(null)
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(() => new Set())
  const speech = useSpeech()
  const recorder = useRecorder()
  const warned = useRef(new Set<number>())
  const timings = useRef<number[]>([])
  const finishing = useRef(false)

  useFocusMode(mode !== 'idle')

  useEffect(() => {
    let live = true
    let url: string | null = null
    void Promise.all([getAllRuns(), getRecording(surahNo)]).then(([all, rec]) => {
      if (!live) return
      setRuns(all.filter((r) => r.surah === surahNo).sort((a, b) => b.at - a.at))
      if (rec) {
        url = URL.createObjectURL(rec.blob)
        setMine({ rec, url })
      } else setMine(null)
    })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [surahNo, recitations])

  const busyError = startError ?? (speech.error === 'busy' ? t.recite.micBusy : null)
  const remote = sync.remoteRecordings.find((r) => r.surah === surahNo)
  const days = cleanDays(runs, surahNo)
  const unlocked = canRecord(runs, surahNo)

  const heard = useMemo(
    () => heardWords(`${speech.finalText} ${speech.interimText}`),
    [speech.finalText, speech.interimText],
  )
  const followed = useMemo(
    () => (expected ? follow(expected, heard, speech.interimText.length > 0) : null),
    [expected, heard, speech.interimText],
  )
  // Similar ayahs the recitation drifted into; saved as pairs to practise when the run ends.
  const mixups = useMemo(() => {
    if (!expected || !followed || !simple) return []
    return mixupsIn(wordIndexFor(simple), expected, heard, followed.strays).filter((m) => !dismissed.has(m.ayah))
  }, [expected, followed, simple, heard, dismissed])

  const begin = async (m: 'run' | 'record') => {
    primeAudio()
    setBusyError(null)
    if (!(await getKv<boolean>('speechNotice'))) {
      setNotice(m)
      return
    }
    warned.current.clear()
    timings.current = [0]
    finishing.current = false
    setOutcome(null)
    if (m === 'record') {
      try {
        await recorder.start()
      } catch {
        setBusyError(t.listen.denied)
        return
      }
    }
    speech.start()
    setMode(m)
    setDismissed(new Set())
    const plain = await loadSimpleText()
    setSimple(plain)
    setExpected(
      buildExpected(
        indices,
        (i) => quran.text(i),
        (i) => plain[i]!,
        0,
      ),
    )
  }

  const cancel = async () => {
    speech.stop()
    await recorder.stop()
    setMode('idle')
    setExpected(null)
  }

  const finish = useCallback(
    async (slips: number) => {
      if (finishing.current) return
      finishing.current = true
      speech.stop()
      const take = mode === 'record' ? await recorder.stop() : null
      for (const m of mixups) await recordAnswer(pairItem(quran, m.ayah, m.other), 'missed', 'pair')
      const now = Date.now()
      const run: Run = { id: crypto.randomUUID(), surah: surahNo, at: now, slips, synced: 0 }
      const newDay = slips === 0 && !cleanToday(runs, surahNo, now)
      await addRun(run)
      const all = [run, ...runs]
      setRuns(all)
      touchRecitations(true)
      setOutcome({
        kind: mode === 'record' ? 'record' : 'run',
        slips,
        newDay,
        days: cleanDays(all, surahNo),
        take: take ? { ...take, url: URL.createObjectURL(take.blob), timings: [...timings.current] } : undefined,
      })
      setMode('idle')
      setExpected(null)
    },
    [mode, recorder, runs, speech, surahNo, touchRecitations, mixups, recordAnswer, quran],
  )

  // Warn on slips, note when each ayah starts, and finish at the end.
  const { listening } = speech
  useEffect(() => {
    if (!followed || !expected || mode === 'idle') return
    let fresh = false
    for (const p of followed.slips.keys()) {
      if (!warned.current.has(p)) {
        warned.current.add(p)
        fresh = true
      }
    }
    if (fresh && listening) warn({ sound: settings.listenSound, vibrate: settings.listenVibrate })
    if (mode === 'record' && followed.next > 0) {
      const ayah = expected[followed.next - 1]!.ayah - surah.start
      if (ayah > 0 && timings.current[ayah] === undefined) {
        timings.current[ayah] = Math.max(timings.current[ayah - 1] ?? 0, recorder.now() - LATENCY_MS)
      }
    }
    if (followed.done) void finish(followed.slips.size)
  }, [followed, expected, mode, listening, settings.listenSound, settings.listenVibrate, recorder, surah, finish])

  const saveTake = async () => {
    if (!outcome?.take) return
    const tk = outcome.take
    // Ayahs whose start wasn't caught take the previous start.
    const filled = indices.map((_, k) => tk.timings[k] ?? tk.timings[k - 1] ?? 0)
    const rec: Recording = {
      surah: surahNo,
      blob: tk.blob,
      mime: tk.mime,
      durationMs: tk.durationMs,
      timings: filled.map((v, k) => Math.max(v, k ? filled[k - 1]! : 0)),
      recordedAt: Date.now(),
      uploaded: 0,
    }
    await putRecording(rec)
    URL.revokeObjectURL(tk.url)
    setOutcome(null)
    touchRecitations(true)
    if (sync.email) {
      try {
        await sync.uploadRecording(rec)
        toast({ text: t.recite.savedAccount })
      } catch {
        toast({ text: t.recite.uploadFailed })
      }
    } else toast({ text: t.recite.saved })
  }

  const removeMine = async () => {
    setConfirmDelete(false)
    await deleteRecording(surahNo)
    if (sync.email) await sync.deleteRemoteRecording(surahNo).catch(() => undefined)
    touchRecitations(true)
  }

  const getMine = async () => {
    if (!remote) return
    await sync.downloadRecording(remote)
    touchRecitations()
  }

  const slipsText = (k: number) => t.recite.slipsCount(k, num(k))
  const dateText = (ms: number) =>
    new Intl.DateTimeFormat(i18n.lang === 'ar' ? 'ar-EG' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(ms)

  // ---------- Reciting ----------
  if (mode !== 'idle') {
    const pos = followed ? Math.min(followed.next, (expected?.length ?? 1) - 1) : 0
    const current = expected?.[pos]?.ayah ?? surah.start
    const k = current - surah.start + 1
    return (
      <div className="quiz">
        <div className="quiz__bar">
          <span className="quiz__counter" style={{ textAlign: 'start' }}>
            {t.recite.progress(num(k), num(surah.ayahs))}
          </span>
          <div className="meter" aria-hidden="true">
            <div style={{ width: `${((k - 1) / surah.ayahs) * 100}%` }} />
          </div>
          {mode === 'record' && (
            <span className="rec-badge">
              <span className="dot dot--rec" aria-hidden="true" />
              {t.recite.recording} {formatTime(recorder.elapsed)}
            </span>
          )}
        </div>
        <h1 className="quiz__ask" style={{ fontSize: 'var(--step-0)' }}>
          {i18n.surahName(surah)}
        </h1>
        <div className="lawh">
          {current > surah.start && <Ayahs indices={[current - 1]} className="quran--context" />}
          {expected && followed ? (
            <RecitationBoard
              indices={[current]}
              expected={expected}
              result={followed}
              promptWords={0}
              complete={false}
            />
          ) : (
            <p className="note">{t.listen.loading}</p>
          )}
        </div>
        <Mixups mixups={mixups} simple={simple} onDismiss={(a) => setDismissed((d) => new Set(d).add(a))} />
        <div className="quiz__actions">
          <p className="listen-status" role={speech.error || busyError ? 'alert' : 'status'}>
            {speech.listening && (
              <span className={`dot ${followed?.stuck ? 'dot--bad' : 'dot--live'}`} aria-hidden="true" />
            )}
            {busyError ??
              (speech.error === 'denied'
                ? t.listen.denied
                : speech.error === 'network'
                  ? t.listen.network
                  : speech.error
                    ? t.listen.failed
                    : followed?.stuck
                      ? t.listen.slipped
                      : t.listen.listening)}
            {followed && followed.slips.size > 0 && (
              <>
                {t.sep}
                {slipsText(followed.slips.size)}
              </>
            )}
          </p>
          <button type="button" className="btn btn--large btn--block" onClick={() => void cancel()}>
            {t.recite.stop}
          </button>
        </div>
      </div>
    )
  }

  // ---------- Overview ----------
  const canListen = speechSupported()
  return (
    <div className="stack">
      <div className="section">
        <button
          type="button"
          className="btn btn--quiet"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => navigate('/recite')}
        >
          {t.recite.back}
        </button>
        <h1>
          <span lang="ar" translate="no" className="surah-title__name">
            سورة {surah.name}
          </span>
        </h1>
        <p className="muted">{t.memorized.ayahs(surah.ayahs, num(surah.ayahs))}</p>
      </div>

      {outcome && (
        <section className="panel stack" style={{ gap: '0.75rem' }} aria-live="polite">
          {outcome.kind === 'run' ? (
            <p>
              {outcome.slips > 0
                ? t.recite.resultSlips(slipsText(outcome.slips))
                : outcome.newDay
                  ? t.recite.resultClean(num(Math.min(outcome.days, RUNS_TO_UNLOCK)), num(RUNS_TO_UNLOCK))
                  : t.recite.resultCleanAgain}
            </p>
          ) : outcome.slips === 0 && outcome.take ? (
            <>
              <p>{t.recite.takeClean}</p>
              <audio controls src={outcome.take.url} style={{ width: '100%' }} />
              <div className="row" style={{ justifyContent: 'flex-start' }}>
                <button type="button" className="btn btn--primary" onClick={() => void saveTake()}>
                  {t.recite.save}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    URL.revokeObjectURL(outcome.take!.url)
                    setOutcome(null)
                  }}
                >
                  {t.recite.discard}
                </button>
              </div>
            </>
          ) : (
            <p>{t.recite.takeSlips(slipsText(outcome.slips))}</p>
          )}
        </section>
      )}

      <section className="section">
        <div className="pips pips--large" aria-hidden="true">
          {Array.from({ length: RUNS_TO_UNLOCK }, (_, k) => (
            <i key={k} className={k < days ? 'pip pip--on' : 'pip'} />
          ))}
        </div>
        <p>{t.recite.clean(num(Math.min(days, RUNS_TO_UNLOCK)), num(RUNS_TO_UNLOCK))}</p>
        {!canListen && <p className="error">{t.listen.unsupported}</p>}
        {busyError && <p className="error">{busyError}</p>}
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button
            type="button"
            className="btn btn--primary btn--large"
            disabled={!canListen}
            onClick={() => void begin('run')}
          >
            <MicIcon />
            {t.recite.runFromMemory}
          </button>
          <button
            type="button"
            className="btn btn--large"
            disabled={!canListen || !unlocked || !recorderSupported()}
            onClick={() => void begin('record')}
          >
            <span className="dot dot--rec" aria-hidden="true" />
            {t.recite.record}
          </button>
        </div>
        {!unlocked && <p className="muted small">{t.recite.locked}</p>}
        {!unlocked && cleanToday(runs, surahNo, openedAt) && <p className="muted small">{t.recite.todayDone}</p>}
        {unlocked && !recorderSupported() && <p className="error">{t.recite.noRecorder}</p>}
      </section>

      {(mine || remote) && (
        <section className="section" aria-labelledby="mine-h">
          <h2 id="mine-h">{t.recite.recorded}</h2>
          {mine ? (
            <>
              <p className="muted small">{t.recite.recordedOn(dateText(mine.rec.recordedAt))}</p>
              <audio controls src={mine.url} style={{ width: '100%' }} aria-label={t.recite.playMine} />
            </>
          ) : (
            remote && (
              <>
                <p className="muted small">
                  {t.recite.inAccount}
                  {t.sep}
                  {t.recite.recordedOn(dateText(remote.recordedAt))}
                </p>
                <button type="button" className="btn" onClick={() => void getMine()}>
                  {t.recite.getMine}
                </button>
              </>
            )
          )}
          <div>
            <button type="button" className="btn btn--quiet btn--danger" onClick={() => setConfirmDelete(true)}>
              {t.recite.deleteMine}
            </button>
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="hist-h">
        <h2 id="hist-h">{t.recite.history}</h2>
        {runs.length === 0 ? (
          <p className="muted">{t.recite.noHistory}</p>
        ) : (
          <ul className="review-list">
            {runs.slice(0, 10).map((r) => (
              <li key={r.id}>
                <span>{dateText(r.at)}</span>
                <span className={r.slips === 0 ? 'ok-text' : 'muted'}>{slipsText(r.slips)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={notice !== null}
        onClose={() => setNotice(null)}
        title={t.listen.noticeTitle}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setNotice(null)}>
              {t.settings.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={async () => {
                const m = notice
                setNotice(null)
                await setKv('speechNotice', true)
                if (m === 'run' || m === 'record') void begin(m)
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

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t.recite.deleteTitle}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
              {t.settings.cancel}
            </button>
            <button type="button" className="btn btn--danger" onClick={() => void removeMine()}>
              {t.settings.delete}
            </button>
          </>
        }
      >
        <p>{t.recite.deleteBody}</p>
      </Dialog>
    </div>
  )
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
