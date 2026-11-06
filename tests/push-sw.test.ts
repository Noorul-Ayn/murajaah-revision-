// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** The service worker's reminder handlers, run against a stand-in for the worker. */

function load() {
  const handlers: Record<string, (e: unknown) => void> = {}
  const shown: { title: string; options: Record<string, unknown> }[] = []
  const opened: string[] = []
  const self = {
    addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
    registration: {
      scope: 'https://example.github.io/murajaah-revision-/',
      showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }),
    },
    clients: {
      matchAll: async () => [],
      openWindow: async (url: string) => void opened.push(url),
    },
  }
  const code = readFileSync(path.resolve(__dirname, '../public/push-sw.js'), 'utf8')
  new Function('self', code)(self)
  const fire = async (type: string, event: Record<string, unknown>) => {
    let wait: Promise<unknown> = Promise.resolve()
    handlers[type]!({ ...event, waitUntil: (p: Promise<unknown>) => (wait = p) })
    await wait
  }
  return { fire, shown, opened }
}

const push = (data: unknown) => ({ data: { json: () => data } })

describe('the reminder notification', () => {
  it('says how many questions are due, in English or Arabic', async () => {
    const sw = load()
    await sw.fire('push', push({ lang: 'en', due: 12 }))
    await sw.fire('push', push({ lang: 'en', due: 1 }))
    await sw.fire('push', push({ lang: 'ar', due: 7 }))
    await sw.fire('push', push({ lang: 'ar', due: 25 }))
    await sw.fire('push', push({ lang: 'ar', due: null }))
    expect(sw.shown.map((n) => [n.title, n.options.body])).toEqual([
      ['Murajaah', '12 questions are due today.'],
      ['Murajaah', '1 question is due today.'],
      ['مراجعة', '٧ أسئلة حان وقت مراجعتها اليوم.'],
      ['مراجعة', '٢٥ سؤالًا حان وقت مراجعتها اليوم.'],
      ['مراجعة', 'حان وقت مراجعتك اليومية.'],
    ])
    expect(sw.shown[2]!.options.dir).toBe('rtl')
    expect(sw.shown[0]!.options.tag).toBe('murajaah-daily')
  })

  it('copes with an empty push, and opens the app when tapped', async () => {
    const sw = load()
    await sw.fire('push', { data: null })
    expect(sw.shown[0]!.options.body).toBe('Time for your daily revision.')
    await sw.fire('notificationclick', {
      notification: { close: () => undefined, data: { url: 'https://example.github.io/murajaah-revision-/' } },
    })
    expect(sw.opened).toEqual(['https://example.github.io/murajaah-revision-/'])
  })
})
