import { useCallback, useEffect, useRef, useState } from 'react'
import type { Quran } from '../lib/quran'
import { ayahUrl, MINE, playsBasmalaBefore, reciterById } from '../lib/reciters'

/**
 * Plays the Qur'an ayah by ayah, either from a reciter on EveryAyah (one MP3
 * per ayah) or from the user's own recording of a surah (one file, with the
 * start time of each ayah). Ayahs can be repeated, and playback runs on
 * through the following ayahs and surahs until stopped.
 */

export interface MyRecording {
  url: string
  /** Start of each ayah in ms. */
  timings: number[]
}

export type PlayerError = 'load' | 'not-recorded'

export interface Player {
  /** The ayah playing (or paused), as a global index; null when stopped. */
  index: number | null
  playing: boolean
  error: PlayerError | null
  play: (from: number) => void
  toggle: () => void
  next: () => void
  previous: () => void
  stop: () => void
}

interface Options {
  quran: Quran
  reciter: string
  repeat: number
  speed: number
  /** The user's recordings by surah, for the "mine" reciter. */
  mine: ReadonlyMap<number, MyRecording>
  /** Label for the lock screen and notification. */
  describe: (index: number) => { title: string; artist: string }
}

export function usePlayer(opts: Options): Player {
  const [index, setIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<PlayerError | null>(null)

  const audio = useRef<HTMLAudioElement | null>(null)
  const preload = useRef<HTMLAudioElement | null>(null)
  const o = useRef(opts)
  const cur = useRef<{ index: number; phase: 'basmala' | 'ayah'; repeatsLeft: number } | null>(null)

  useEffect(() => {
    o.current = opts
    if (audio.current) {
      audio.current.playbackRate = opts.speed
      audio.current.defaultPlaybackRate = opts.speed
    }
  })

  const el = useCallback((): HTMLAudioElement => {
    audio.current ??= new Audio()
    return audio.current
  }, [])

  const updateSession = useCallback((i: number) => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
    const { title, artist } = o.current.describe(i)
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album: 'Murajaah' })
  }, [])

  const startAt = useCallback(
    function startAt(i: number, withBasmala = true) {
      const { quran, reciter, mine, speed, repeat } = o.current
      const a = el()
      const { surah, ayah } = quran.keyOf(i)
      setError(null)
      setIndex(i)
      updateSession(i)
      if (reciter === MINE) {
        const rec = mine.get(surah)
        if (!rec) {
          a.pause()
          setPlaying(false)
          setError('not-recorded')
          cur.current = null
          return
        }
        cur.current = { index: i, phase: 'ayah', repeatsLeft: repeat }
        if (a.src !== rec.url) a.src = rec.url
        a.playbackRate = speed
        const seek = () => {
          a.currentTime = (rec.timings[ayah - 1] ?? 0) / 1000
        }
        if (a.readyState >= 1) seek()
        else a.addEventListener('loadedmetadata', seek, { once: true })
      } else {
        const r = reciterById(reciter) ?? reciterById('alafasy')!
        const basmala = withBasmala && playsBasmalaBefore(surah, ayah)
        cur.current = { index: i, phase: basmala ? 'basmala' : 'ayah', repeatsLeft: repeat }
        a.src = basmala ? ayahUrl(r, 1, 1) : ayahUrl(r, surah, ayah)
        a.playbackRate = speed
        // Warm the cache with what plays next (the next ayah, or the
        // basmala before it when it opens a surah) so there's no gap.
        const n = basmala ? i : i + 1
        if (n < 6236) {
          const k = quran.keyOf(n)
          const nextIsBasmala = !basmala && playsBasmalaBefore(k.surah, k.ayah)
          preload.current = new Audio(nextIsBasmala ? ayahUrl(r, 1, 1) : ayahUrl(r, k.surah, k.ayah))
          preload.current.preload = 'auto'
        }
      }
      a.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      )
    },
    [el, updateSession],
  )

  const stop = useCallback(() => {
    audio.current?.pause()
    cur.current = null
    setPlaying(false)
    setIndex(null)
    setError(null)
  }, [])

  const next = useCallback(() => {
    const c = cur.current
    if (c && c.index < 6235) startAt(c.index + 1)
  }, [startAt])

  const previous = useCallback(() => {
    const c = cur.current
    if (c && c.index > 0) startAt(c.index - 1, false)
  }, [startAt])

  const toggle = useCallback(() => {
    const a = audio.current
    if (!a || !cur.current) return
    if (a.paused) void a.play().then(() => setPlaying(true))
    else {
      a.pause()
      setPlaying(false)
    }
  }, [])

  useEffect(() => {
    const a = el()
    const onEnded = () => {
      const c = cur.current
      if (!c) return
      const { quran, reciter, mine } = o.current
      if (reciter !== MINE && c.phase === 'basmala') {
        const r = reciterById(reciter) ?? reciterById('alafasy')!
        const k = quran.keyOf(c.index)
        c.phase = 'ayah'
        a.src = ayahUrl(r, k.surah, k.ayah)
        void a.play()
        return
      }
      if (c.repeatsLeft > 1) {
        c.repeatsLeft--
        if (reciter === MINE) {
          const k = quran.keyOf(c.index)
          a.currentTime = (mine.get(k.surah)?.timings[k.ayah - 1] ?? 0) / 1000
        } else a.currentTime = 0
        void a.play()
        return
      }
      if (c.index < 6235) startAt(c.index + 1)
      else stop()
    }
    // Own recordings are one file per surah: follow the ayah timings.
    const onTime = () => {
      const c = cur.current
      const { quran, reciter, mine } = o.current
      if (!c || reciter !== MINE) return
      const k = quran.keyOf(c.index)
      const timings = mine.get(k.surah)?.timings ?? []
      const t = a.currentTime * 1000
      const nextStart = timings[k.ayah]
      if (nextStart !== undefined && t >= nextStart) {
        if (c.repeatsLeft > 1) {
          c.repeatsLeft--
          a.currentTime = (timings[k.ayah - 1] ?? 0) / 1000
        } else {
          c.index++
          c.repeatsLeft = o.current.repeat
          setIndex(c.index)
          updateSession(c.index)
        }
      }
    }
    const onError = () => {
      if (cur.current) {
        setError('load')
        setPlaying(false)
      }
    }
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    a.addEventListener('ended', onEnded)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('error', onError)
    a.addEventListener('pause', onPause)
    a.addEventListener('play', onPlay)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => void a.play())
      navigator.mediaSession.setActionHandler('pause', () => a.pause())
      navigator.mediaSession.setActionHandler('nexttrack', next)
      navigator.mediaSession.setActionHandler('previoustrack', previous)
    }
    return () => {
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('error', onError)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('play', onPlay)
    }
  }, [el, next, previous, startAt, stop, updateSession])

  // Stop when the reader closes.
  useEffect(
    () => () => {
      audio.current?.pause()
    },
    [],
  )

  return { index, playing, error, play: startAt, toggle, next, previous, stop }
}
