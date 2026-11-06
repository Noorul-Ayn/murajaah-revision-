import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Live speech recognition through the browser (Web Speech API).
 *
 * Chrome and Edge send the audio to their speech service and return text as
 * it is spoken; Safari uses Apple's. Firefox has no support. Recognition can
 * stop by itself after a pause, so it is restarted until stop() is called,
 * and text from earlier sessions is kept.
 */

interface RecognitionAlternative {
  transcript: string
}
interface RecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: RecognitionAlternative
}
interface RecognitionEvent {
  readonly results: { readonly length: number; [index: number]: RecognitionResult }
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechSupported = (): boolean => ctor() !== null

export type SpeechError = 'denied' | 'network' | 'no-speech' | 'busy' | 'other'

export interface Speech {
  listening: boolean
  /** Everything recognized so far; the part still being heard comes last. */
  finalText: string
  interimText: string
  error: SpeechError | null
  start: () => void
  stop: () => void
}

export function useSpeech(lang = 'ar-SA'): Speech {
  const [listening, setListening] = useState(false)
  const [finalText, setFinal] = useState('')
  const [interimText, setInterim] = useState('')
  const [error, setError] = useState<SpeechError | null>(null)
  const rec = useRef<Recognition | null>(null)
  const wanted = useRef(false)
  const carried = useRef('')
  const silentRestarts = useRef(0)

  const stop = useCallback(() => {
    wanted.current = false
    rec.current?.stop()
    setListening(false)
  }, [])

  const begin = useCallback(
    function begin() {
      const Ctor = ctor()
      if (!Ctor) return
      const r = new Ctor()
      r.lang = lang
      r.continuous = true
      r.interimResults = true
      r.maxAlternatives = 1
      let sessionFinal = ''
      r.onresult = (e) => {
        silentRestarts.current = 0
        let fin = ''
        let interim = ''
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i]!
          if (res.isFinal) fin += ` ${res[0]!.transcript}`
          else interim += ` ${res[0]!.transcript}`
        }
        sessionFinal = fin
        setFinal(`${carried.current} ${fin}`.trim())
        setInterim(interim.trim())
      }
      r.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return
        wanted.current = false
        setError(
          e.error === 'not-allowed' || e.error === 'service-not-allowed'
            ? 'denied'
            : e.error === 'network'
              ? 'network'
              : e.error === 'audio-capture'
                ? 'busy'
                : 'other',
        )
      }
      r.onend = () => {
        carried.current = `${carried.current} ${sessionFinal}`.trim()
        setInterim('')
        if (wanted.current && silentRestarts.current < 8) {
          silentRestarts.current++
          try {
            begin()
            return
          } catch {
            // fall through to stopping
          }
        }
        if (wanted.current && silentRestarts.current >= 8) setError('no-speech')
        wanted.current = false
        setListening(false)
      }
      rec.current = r
      r.start()
    },
    [lang],
  )

  const start = useCallback(() => {
    carried.current = ''
    silentRestarts.current = 0
    setFinal('')
    setInterim('')
    setError(null)
    wanted.current = true
    setListening(true)
    try {
      begin()
    } catch {
      wanted.current = false
      setListening(false)
      setError('other')
    }
  }, [begin])

  useEffect(
    () => () => {
      wanted.current = false
      rec.current?.abort()
    },
    [],
  )

  return { listening, finalText, interimText, error, start, stop }
}
