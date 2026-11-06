// Murajaah daily reminder: sends one push notification to each device whose
// reminder time has come. Called every 15 minutes by the database (see
// supabase/migrations/20261108000000_reminders.sql), which sends the list of
// devices to remind; this function never reads the database itself.
//
// One self-contained file, so it can be pasted into the Supabase dashboard's
// Edge Function editor. Web push is implemented on the standard Web Crypto
// API: message encryption per RFC 8291 (aes128gcm) and VAPID per RFC 8292.
//
// Secrets (Edge Functions → Secrets): REMINDER_SECRET, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com).
// Deploy with JWT verification off: the database authenticates with
// REMINDER_SECRET instead.

/** A device to remind, as sent by public.send_due_reminders(). */
export interface Reminder {
  endpoint: string
  p256dh: string
  auth: string
  lang: 'ar' | 'en'
  /** Questions due today, or null when the app hasn't said. */
  due: number | null
}

export interface Vapid {
  /** Uncompressed P-256 public key, base64url (65 bytes). */
  publicKey: string
  /** P-256 private key scalar, base64url (32 bytes). */
  privateKey: string
  /** mailto: or https: contact for the push service. */
  subject: string
}

const enc = new TextEncoder()

/** Web Crypto wants ArrayBuffer-backed bytes; ours always are. */
const buf = (bytes: Uint8Array) => bytes as unknown as BufferSource

export function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits'])
  const params = { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) }
  return new Uint8Array(await crypto.subtle.deriveBits(params, key, bytes * 8))
}

/** Encrypts a payload for one subscription (RFC 8291): the request body to send. */
export async function encrypt(
  payload: Uint8Array,
  sub: { p256dh: string; auth: string },
  // For tests: fixed sender keys and salt.
  fixed?: { keys: CryptoKeyPair; salt: Uint8Array },
): Promise<Uint8Array> {
  const uaPublic = fromB64url(sub.p256dh)
  const authSecret = fromB64url(sub.auth)
  const keys =
    fixed?.keys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', buf(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, keys.privateKey, 256))
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt'])
  // One record: the payload and the final-record delimiter, no padding.
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, aes, buf(concat(payload, new Uint8Array([2])))),
  )
  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  return concat(header, asPublic, cipher)
}

/** The VAPID Authorization header for a push service (RFC 8292). */
export async function vapidAuth(endpoint: string, vapid: Vapid, now = Date.now()): Promise<string> {
  const pub = fromB64url(vapid.publicKey)
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: vapid.privateKey,
      x: b64url(pub.slice(1, 33)),
      y: b64url(pub.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const part = (o: object) => b64url(enc.encode(JSON.stringify(o)))
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 3600,
    sub: vapid.subject,
  })}`
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, buf(enc.encode(unsigned))),
  )
  return `vapid t=${unsigned}.${b64url(sig)}, k=${vapid.publicKey}`
}

/** Sends one notification. Resolves to the push service's HTTP status. */
export async function sendPush(r: Reminder, vapid: Vapid, fetchImpl: typeof fetch = fetch): Promise<number> {
  const body = await encrypt(enc.encode(JSON.stringify({ lang: r.lang, due: r.due })), r)
  const res = await fetchImpl(r.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(r.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(6 * 3600),
      Urgency: 'normal',
    },
    body: buf(body),
  })
  return res.status
}

/** Handles the database's call: checks the shared secret, then sends each reminder. */
export async function handle(
  req: Request,
  env: (name: string) => string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const secret = env('REMINDER_SECRET')
  if (!secret || req.headers.get('x-reminder-secret') !== secret) return new Response('Forbidden', { status: 403 })
  const vapid: Vapid = {
    publicKey: env('VAPID_PUBLIC_KEY') ?? '',
    privateKey: env('VAPID_PRIVATE_KEY') ?? '',
    subject: env('VAPID_SUBJECT') ?? '',
  }
  if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) {
    return Response.json({ error: 'VAPID secrets are missing' }, { status: 500 })
  }
  const { reminders = [] } = (await req.json().catch(() => ({}))) as { reminders?: Reminder[] }
  const results = await Promise.allSettled(reminders.map((r) => sendPush(r, vapid, fetchImpl)))
  const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value : 0))
  return Response.json({
    sent: statuses.filter((s) => s >= 200 && s < 300).length,
    // 404 and 410: the browser dropped the subscription; the app subscribes again when next opened.
    gone: reminders.filter((_, k) => statuses[k] === 404 || statuses[k] === 410).map((r) => r.endpoint),
    failed: statuses.filter((s) => s === 0 || s >= 400).length,
  })
}

// Started by the Supabase Edge Runtime (Deno); importing this file elsewhere (tests) does nothing.
const deno = (
  globalThis as {
    Deno?: { serve: (h: (req: Request) => Promise<Response>) => void; env: { get: (n: string) => string | undefined } }
  }
).Deno
if (deno) deno.serve((req) => handle(req, (name) => deno.env.get(name)))
