/**
 * The warning played on a slip: two short, soft descending tones. Made with
 * the Web Audio API, so there is no sound file to download. The audio
 * context is created on a tap (prime), as browsers require.
 */

let ctx: AudioContext | null = null

export function primeAudio(): void {
  if (!ctx && typeof AudioContext !== 'undefined') ctx = new AudioContext()
  void ctx?.resume()
}

function tone(c: AudioContext, freq: number, start: number, length: number) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.25, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(gain).connect(c.destination)
  osc.start(start)
  osc.stop(start + length + 0.02)
}

export function warn(opts: { sound: boolean; vibrate: boolean }): void {
  if (opts.sound && ctx) {
    const t = ctx.currentTime
    tone(ctx, 660, t, 0.14)
    tone(ctx, 440, t + 0.15, 0.2)
  }
  if (opts.vibrate) navigator.vibrate?.([90, 50, 90])
}
