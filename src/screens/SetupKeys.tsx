import { useState } from 'react'
import { Link } from 'react-router'

/**
 * For whoever runs this copy of the app: makes the keys the daily reminder
 * needs, in this browser, with the Web Crypto API. Nothing is sent anywhere.
 * Not linked from the app; docs/SETUP.md points here. English only, like the
 * setup guide.
 */

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

interface Keys {
  publicKey: string
  privateKey: string
  secret: string
}

async function makeKeys(): Promise<Keys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const secret = b64url(crypto.getRandomValues(new Uint8Array(32)))
  return { publicKey, privateKey: d!, secret }
}

function Value({ name, value, where }: { name: string; value: string; where: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="key-row">
      <p>
        <strong>{name}</strong> <span className="muted small">{where}</span>
      </p>
      <div className="key-row__value">
        <code>{value}</code>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => setCopied(true))
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

export function SetupKeys() {
  const [keys, setKeys] = useState<Keys | null>(null)
  return (
    <article className="stack prose" dir="ltr" lang="en">
      <h1>Reminder keys</h1>
      <p>
        For whoever runs this site: the daily reminder needs a key pair to sign its notifications and a secret the
        database uses to call the reminder function. They are made here, in this browser, and never sent anywhere.
        Section 1.8 of the setup guide (<code>docs/SETUP.md</code>) says where each one goes.
      </p>
      <p className="muted small">
        Make them once. Keep the private key and the secret to yourself, like a password. Making new ones later means
        everyone has to turn their reminder off and on again.
      </p>
      {!keys ? (
        <button
          type="button"
          className="btn btn--primary btn--large btn--block"
          onClick={() => void makeKeys().then(setKeys)}
        >
          Make the keys
        </button>
      ) : (
        <div className="stack">
          <Value
            name="VAPID_PUBLIC_KEY"
            value={keys.publicKey}
            where="Supabase Edge Function secret, and the GitHub repository variable VITE_VAPID_PUBLIC_KEY"
          />
          <Value name="VAPID_PRIVATE_KEY" value={keys.privateKey} where="Supabase Edge Function secret only" />
          <Value
            name="REMINDER_SECRET"
            value={keys.secret}
            where="Supabase Edge Function secret, and the Vault secret murajaah_reminder_secret"
          />
        </div>
      )}
      <Link to="/settings" className="btn btn--block">
        Back to settings
      </Link>
    </article>
  )
}
