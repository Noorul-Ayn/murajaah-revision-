import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { verseLabel } from '../i18n/labels'
import { MINE, PLAY_REPEATS, PLAY_SPEEDS, RECITERS } from '../lib/reciters'
import type { Player } from '../hooks/usePlayer'
import { CloseIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from './Icons'

interface Props {
  player: Player
  /** Ayah to start from when Play is pressed with nothing playing. */
  startIndex: number
  onPlay: (index: number) => void
  /** Whether the user has any recordings to offer "You" as a reciter. */
  hasMine: boolean
  downloading: boolean
  onClose: () => void
}

export function PlayerBar({ player, startIndex, onPlay, hasMine, downloading, onClose }: Props) {
  const { quran, settings, updateSettings } = useApp()
  const i18n = useI18n()
  const { t, num } = i18n
  const reciters = RECITERS.map((r) => ({ id: r.id, label: i18n.lang === 'ar' ? r.nameAr : r.name }))

  const message = downloading
    ? t.player.downloading
    : player.error === 'load'
      ? t.player.loadError
      : player.error === 'not-recorded'
        ? t.player.notRecorded
        : player.index !== null
          ? verseLabel(i18n, quran, player.index)
          : t.player.tap

  return (
    <section className="player" aria-label={t.player.listen}>
      <div className="player__top">
        <select
          className="select"
          aria-label={t.player.reciter}
          value={settings.reciter}
          onChange={(e) => {
            const was = player.index
            updateSettings({ reciter: e.target.value })
            // Carry on from the same ayah with the new reciter.
            if (was !== null && player.playing) setTimeout(() => onPlay(was), 0)
          }}
        >
          {hasMine && <option value={MINE}>{t.player.you}</option>}
          {reciters.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <button type="button" className="icon-btn" aria-label={t.player.close} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <p className="player__now" role="status">
        {message}
      </p>

      {/* Right to left, like the mushaf: the previous ayah is on the right. */}
      <div className="player__controls" dir="rtl">
        <button
          type="button"
          className="icon-btn"
          aria-label={t.player.previous}
          disabled={player.index === null}
          onClick={player.previous}
        >
          <PrevIcon />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--main"
          aria-label={player.playing ? t.player.pause : t.player.play}
          onClick={() => (player.index === null ? onPlay(startIndex) : player.toggle())}
        >
          {player.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t.player.next}
          disabled={player.index === null}
          onClick={player.next}
        >
          <NextIcon />
        </button>
      </div>

      <div className="player__options">
        <label>
          {t.player.repeat}
          <select value={settings.playRepeat} onChange={(e) => updateSettings({ playRepeat: Number(e.target.value) })}>
            {PLAY_REPEATS.map((n) => (
              <option key={n} value={n}>
                {t.player.times(num(n))}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.player.speed}
          <select value={settings.playSpeed} onChange={(e) => updateSettings({ playSpeed: Number(e.target.value) })}>
            {PLAY_SPEEDS.map((n) => (
              <option key={n} value={n}>
                {t.player.times(i18n.lang === 'ar' ? new Intl.NumberFormat('ar-EG').format(n) : String(n))}
              </option>
            ))}
          </select>
        </label>
      </div>
      {settings.reciter !== MINE && <p className="player__credit">{t.player.credit}</p>}
    </section>
  )
}
