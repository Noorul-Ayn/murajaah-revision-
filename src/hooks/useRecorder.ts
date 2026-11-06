import { useCallback, useEffect, useRef, useState } from 'react'

/** Records from the microphone with MediaRecorder, in the best format the browser offers. */

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export function recorderSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

export interface Take {
  blob: Blob
  mime: string
  durationMs: number
}

export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const rec = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef(0)
  const timer = useRef<number | null>(null)

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
    setRecording(false)
  }, [])

  const start = useCallback(async () => {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    stream.current = s
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    const r = new MediaRecorder(s, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 })
    chunks.current = []
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data)
    }
    rec.current = r
    r.start(1000)
    startedAt.current = performance.now()
    setElapsed(0)
    setRecording(true)
    timer.current = window.setInterval(() => setElapsed(performance.now() - startedAt.current), 500)
  }, [])

  /** Stops and returns what was recorded. */
  const stop = useCallback(
    () =>
      new Promise<Take | null>((resolve) => {
        const r = rec.current
        if (!r || r.state === 'inactive') {
          release()
          resolve(null)
          return
        }
        const durationMs = performance.now() - startedAt.current
        r.onstop = () => {
          const mime = r.mimeType || 'audio/webm'
          release()
          resolve({ blob: new Blob(chunks.current, { type: mime }), mime, durationMs })
        }
        r.stop()
      }),
    [release],
  )

  /** Milliseconds since recording started. */
  const now = useCallback(() => (rec.current ? performance.now() - startedAt.current : 0), [])

  useEffect(
    () => () => {
      if (rec.current && rec.current.state !== 'inactive') rec.current.stop()
      release()
    },
    [release],
  )

  return { recording, elapsed, start, stop, now }
}
