import { useState, type FormEvent } from 'react'
import { useSync } from '../app/SyncContext'
import { Link } from 'react-router'
import { useI18n } from '../i18n/I18n'
import { PRIVACY_PATH } from '../lib/report'
import { Dialog } from '../components/controls'
import { useToast } from '../components/Toast'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function Account() {
  const sync = useSync()
  const { t, num, relativeTime } = useI18n()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | 'signout' | 'cloud' | 'account'>(null)

  if (!sync.available) return null

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!EMAIL.test(value)) {
      setError(t.account.badEmail)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await sync.sendCode(value)
      setSentTo(value)
    } catch (err) {
      setError(t.account.error(message(err)))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    if (!sentTo) return
    setBusy(true)
    setError(null)
    try {
      await sync.verifyCode(sentTo, code.trim())
      setSentTo(null)
      setCode('')
    } catch {
      setError(t.account.badCode)
    } finally {
      setBusy(false)
    }
  }

  const act = async (fn: () => Promise<void>, done?: string) => {
    setDialog(null)
    try {
      await fn()
      if (done) toast({ text: done })
    } catch (err) {
      toast({ text: t.account.error(message(err)) })
    }
  }

  const status = sync.status
  const statusLine =
    status.kind === 'syncing'
      ? { dot: 'dot--busy', text: t.account.syncing }
      : status.kind === 'synced'
        ? { dot: 'dot--ok', text: t.account.synced(relativeTime(status.at)) }
        : status.kind === 'offline'
          ? { dot: '', text: t.account.offline }
          : status.kind === 'error'
            ? { dot: 'dot--bad', text: t.account.failed(status.message) }
            : { dot: '', text: t.account.neverSynced }

  const linkMessage = sync.linkError
    ? /expired|invalid|already/i.test(sync.linkError)
      ? t.account.linkExpired
      : t.account.linkFailed
    : null

  return (
    <section className="section" aria-labelledby="account-h">
      <h2 id="account-h">{t.account.title}</h2>
      {linkMessage && !sync.email && (
        <p className="error" role="alert">
          {linkMessage}
        </p>
      )}

      {sync.email ? (
        <div className="panel stack" style={{ gap: '0.9rem' }}>
          <p>{t.account.signedIn(sync.email)}</p>
          <p className="sync-line" role="status">
            <span className={`dot ${statusLine.dot}`} aria-hidden="true" />
            {statusLine.text}
          </p>
          {status.kind === 'synced' && status.held ? (
            <p className="note" style={{ textAlign: 'start' }}>
              {t.account.held(status.held, num(status.held))}
            </p>
          ) : null}
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="btn"
              disabled={status.kind === 'syncing'}
              onClick={() => void sync.syncNow()}
            >
              {t.account.syncNow}
            </button>
            <button type="button" className="btn" onClick={() => setDialog('signout')}>
              {t.account.signOut}
            </button>
          </div>
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn--quiet btn--danger" onClick={() => setDialog('cloud')}>
              {t.account.deleteCloud}
            </button>
            <button type="button" className="btn btn--quiet btn--danger" onClick={() => setDialog('account')}>
              {t.account.deleteAccount}
            </button>
          </div>
        </div>
      ) : sentTo ? (
        <form className="panel stack" style={{ gap: '0.9rem' }} onSubmit={(e) => void verify(e)}>
          <p>{t.account.codeSent(sentTo)}</p>
          <label className="field">
            <span>{t.account.code}</span>
            <input
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button type="submit" className="btn btn--primary" disabled={busy || code.length < 6}>
              {busy ? t.account.verifying : t.account.verify}
            </button>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => {
                setSentTo(null)
                setCode('')
                setError(null)
              }}
            >
              {t.account.otherEmail}
            </button>
          </div>
        </form>
      ) : (
        <form className="panel stack" style={{ gap: '0.9rem' }} onSubmit={(e) => void send(e)} noValidate>
          <p className="muted small">
            {t.account.pitch} <Link to={PRIVACY_PATH}>{t.settings.privacy}</Link>
          </p>
          <label className="field">
            <span>{t.account.email}</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? t.account.sending : t.account.sendCode}
          </button>
        </form>
      )}

      <Dialog
        open={dialog === 'signout'}
        onClose={() => setDialog(null)}
        title={t.account.signOutTitle}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setDialog(null)}>
              {t.settings.cancel}
            </button>
            <button type="button" className="btn" onClick={() => void act(() => sync.signOut(false))}>
              {t.account.signOutRemove}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => void act(() => sync.signOut(true))}>
              {t.account.signOutKeep}
            </button>
          </>
        }
      >
        <p>{t.account.signOutBody}</p>
      </Dialog>

      <Dialog
        open={dialog === 'cloud'}
        onClose={() => setDialog(null)}
        title={t.account.deleteCloudTitle}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setDialog(null)}>
              {t.settings.cancel}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void act(sync.deleteCloud, t.account.deleteCloudDone)}
            >
              {t.settings.delete}
            </button>
          </>
        }
      >
        <p>{t.account.deleteCloudBody}</p>
      </Dialog>

      <Dialog
        open={dialog === 'account'}
        onClose={() => setDialog(null)}
        title={t.account.deleteAccountTitle}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setDialog(null)}>
              {t.settings.cancel}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void act(sync.deleteAccount, t.account.deleteAccountDone)}
            >
              {t.settings.delete}
            </button>
          </>
        }
      >
        <p>{t.account.deleteAccountBody}</p>
      </Dialog>
    </section>
  )
}
