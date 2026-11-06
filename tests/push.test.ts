// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { b64url, encrypt, fromB64url, handle, vapidAuth, type Reminder } from '../supabase/functions/daily-reminder'

/**
 * The reminder Edge Function's web push: encryption is checked against the
 * worked example in RFC 8291 and by decrypting as a browser would; the VAPID
 * signature is verified with the public key.
 */

const dec = new TextDecoder()

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: string | Uint8Array<ArrayBuffer>,
  bytes: number,
) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const i = typeof info === 'string' ? new TextEncoder().encode(info) : info
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: i }, key, bytes * 8),
  )
}

/** Decrypts an aes128gcm body the way the browser does (RFC 8291, receiver side). */
async function decrypt(body: Uint8Array, uaKeys: CryptoKeyPair, authSecret: Uint8Array<ArrayBuffer>) {
  const salt = body.slice(0, 16)
  const idlen = body[20]!
  const asPublic = body.slice(21, 21 + idlen)
  const cipher = body.slice(21 + idlen)
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey))
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256))
  const info = new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...uaPublic, ...asPublic])
  const ikm = await hkdf(authSecret, shared, info, 32)
  const cek = await hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16)
  const nonce = await hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, cipher))
  expect(plain[plain.length - 1]).toBe(2) // the last record's delimiter
  return dec.decode(plain.slice(0, -1))
}

const importEcdh = (pub: string, d: string) => {
  const raw = fromB64url(pub) as Uint8Array<ArrayBuffer>
  const jwk = { kty: 'EC', crv: 'P-256', x: b64url(raw.slice(1, 33)), y: b64url(raw.slice(33, 65)) }
  return Promise.all([
    crypto.subtle.importKey('jwk', { ...jwk, d }, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  ]).then(([privateKey, publicKey]) => ({ privateKey, publicKey }) as CryptoKeyPair)
}

describe('push message encryption', () => {
  it('matches the worked example in RFC 8291, appendix A', async () => {
    const as = await importEcdh(
      'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
      'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    )
    const body = await encrypt(
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      {
        p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        auth: 'BTBZMqHH6r4Tts7J_aSIgg',
      },
      { keys: as, salt: fromB64url('DGv6ra1nlYgDCS1FRnbzlw') as Uint8Array<ArrayBuffer> },
    )
    expect(b64url(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    )
  })

  it('decrypts on the receiving side to the same payload', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const sub = {
      p256dh: b64url(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))),
      auth: b64url(auth),
    }
    const payload = JSON.stringify({ lang: 'ar', due: 12 })
    const body = await encrypt(new TextEncoder().encode(payload), sub)
    expect(await decrypt(body, ua, auth)).toBe(payload)
  })
})

async function vapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return { pair, vapid: { publicKey, privateKey: d!, subject: 'mailto:test@example.com' } }
}

describe('VAPID', () => {
  it('signs a token for the push service’s origin that the public key verifies', async () => {
    const { pair, vapid } = await vapidKeys()
    const header = await vapidAuth('https://fcm.googleapis.com/fcm/send/abc', vapid, Date.UTC(2026, 10, 6))
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!
    expect(k).toBe(vapid.publicKey)
    const [h, c, s] = token!.split('.')
    const claims = JSON.parse(dec.decode(fromB64url(c!)))
    expect(claims).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: Date.UTC(2026, 10, 6) / 1000 + 12 * 3600,
      sub: 'mailto:test@example.com',
    })
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      fromB64url(s!) as Uint8Array<ArrayBuffer>,
      new TextEncoder().encode(`${h}.${c}`),
    )
    expect(ok).toBe(true)
  })
})

describe('the Edge Function', () => {
  const sub = async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair
    return {
      p256dh: b64url(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))),
      auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
    }
  }

  it('refuses a call without the shared secret', async () => {
    const res = await handle(new Request('https://x/functions/v1/daily-reminder', { method: 'POST' }), (n) =>
      n === 'REMINDER_SECRET' ? 's3cret' : undefined,
    )
    expect(res.status).toBe(403)
  })

  it('sends each reminder and reports the subscriptions that are gone', async () => {
    const { vapid } = await vapidKeys()
    const env: Record<string, string> = {
      REMINDER_SECRET: 's3cret',
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: vapid.subject,
    }
    const reminders: Reminder[] = [
      { endpoint: 'https://push.example/ok', ...(await sub()), lang: 'en', due: 5 },
      { endpoint: 'https://push.example/gone', ...(await sub()), lang: 'ar', due: null },
    ]
    const calls: { url: string; init: RequestInit }[] = []
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(null, { status: url.endsWith('gone') ? 410 : 201 })
    }) as unknown as typeof fetch
    const res = await handle(
      new Request('https://x/functions/v1/daily-reminder', {
        method: 'POST',
        headers: { 'x-reminder-secret': 's3cret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminders }),
      }),
      (n) => env[n],
      fakeFetch,
    )
    expect(await res.json()).toEqual({ sent: 1, gone: ['https://push.example/gone'], failed: 1 })
    expect(calls).toHaveLength(2)
    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers['Content-Encoding']).toBe('aes128gcm')
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=/)
  })
})
