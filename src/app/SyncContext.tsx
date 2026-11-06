import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { appUrl, clearAuthRedirect, readAuthRedirect, supabase, syncConfigured } from '../sync/client'
import { deleteCloudData, syncNow } from '../sync/sync'
import {
  deleteAllRemoteRecordings,
  deleteRemoteRecording,
  downloadRecording,
  getRemoteRecordings,
  syncRecordings,
  uploadRecording,
  type RemoteRecording,
} from '../sync/recordings'
import type { Recording } from '../storage/db'
import { clearProgress, getKv, markAllUnsynced, setKv } from '../storage/db'
import { useApp } from './AppContext'

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number }
  | { kind: 'offline' }
  | { kind: 'error'; message: string }

export interface Sync {
  /** False when the build has no Supabase configuration. */
  available: boolean
  email: string | null
  status: SyncStatus
  /** Set when the page was opened from a sign-in link that didn't work here. */
  linkError: string | null
  dismissLinkError: () => void
  sendCode: (email: string) => Promise<void>
  verifyCode: (email: string, code: string) => Promise<void>
  syncNow: () => Promise<void>
  signOut: (keepLocal: boolean) => Promise<void>
  deleteCloud: () => Promise<void>
  deleteAccount: () => Promise<void>
  /** Recordings kept in the account (signed in only). */
  remoteRecordings: RemoteRecording[]
  uploadRecording: (rec: Recording) => Promise<void>
  downloadRecording: (remote: RemoteRecording) => Promise<Recording | null>
  deleteRemoteRecording: (surah: number) => Promise<void>
}

const SyncContext = createContext<Sync | null>(null)

export function useSync(): Sync {
  const s = useContext(SyncContext)
  if (!s) throw new Error('useSync outside SyncProvider')
  return s
}

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e)

/** Debounce after a local change before pushing it. */
const PUSH_DELAY_MS = 4000

export function SyncProvider({ children }: { children: ReactNode }) {
  const app = useApp()
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SyncStatus>({ kind: 'idle' })
  const [linkError, setLinkError] = useState<string | null>(null)
  const [remoteRecordings, setRemoteRecordings] = useState<RemoteRecording[]>([])
  const running = useRef<Promise<void> | null>(null)
  const again = useRef(false)
  const appRef = useRef(app)
  useEffect(() => {
    appRef.current = app
  }, [app])

  useEffect(() => {
    if (!supabase) return
    void getKv<number>('lastSync').then((at) => at && setStatus({ kind: 'synced', at }))
    void getRemoteRecordings().then(setRemoteRecordings)
    const redirect = readAuthRedirect()
    // getSession waits for a sign-in link's ?code=… to be exchanged first.
    supabase.auth.getSession().then(({ data, error }) => {
      setSession(data.session)
      if (redirect.error || ((redirect.hasCode || error) && !data.session)) {
        setLinkError(redirect.error ?? error?.message ?? 'link')
      }
      if (redirect.hasCode || redirect.error) clearAuthRedirect()
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  const run = useCallback(async (): Promise<void> => {
    if (!supabase || !userId) return
    if (running.current) {
      again.current = true
      return running.current
    }
    if (!navigator.onLine) {
      setStatus({ kind: 'offline' })
      return
    }
    const job = (async () => {
      setStatus({ kind: 'syncing' })
      try {
        do {
          again.current = false
          const result = await syncNow(supabase, userId)
          if (result.settings) appRef.current.replaceSettings(result.settings)
          if (result.pulled > 0) await appRef.current.reloadProgress()
          try {
            setRemoteRecordings(await syncRecordings(supabase, userId))
          } catch (e) {
            console.warn('Recordings did not sync', e)
          }
          if (result.pulledRuns) appRef.current.touchRecitations()
        } while (again.current)
        const at = Date.now()
        await setKv('lastSync', at)
        setStatus({ kind: 'synced', at })
      } catch (e) {
        setStatus(navigator.onLine ? { kind: 'error', message: errorMessage(e) } : { kind: 'offline' })
      } finally {
        running.current = null
      }
    })()
    running.current = job
    return job
  }, [userId])

  // Sync on sign-in, when the app comes back to the foreground, and when the
  // connection returns.
  useEffect(() => {
    if (!userId) return
    const first = window.setTimeout(() => void run(), 0)
    const onVisible = () => document.visibilityState === 'visible' && void run()
    const onOnline = () => void run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    const timer = window.setInterval(() => void run(), 5 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.clearInterval(timer)
      window.clearTimeout(first)
    }
  }, [userId, run])

  // Push local changes shortly after they happen.
  useEffect(() => {
    if (!userId || app.changes === 0) return
    const timer = window.setTimeout(() => void run(), PUSH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [app.changes, userId, run])

  const value = useMemo<Sync>(
    () => ({
      available: syncConfigured,
      email: session?.user.email ?? null,
      status,
      linkError,
      dismissLinkError: () => setLinkError(null),
      sendCode: async (email) => {
        if (!supabase) return
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true, emailRedirectTo: appUrl() },
        })
        if (error) throw error
      },
      verifyCode: async (email, code) => {
        if (!supabase) return
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
        if (error) throw error
      },
      syncNow: run,
      signOut: async (keepLocal) => {
        if (!supabase) return
        await run().catch(() => undefined)
        await supabase.auth.signOut()
        await setKv('lastSync', null)
        setStatus({ kind: 'idle' })
        if (!keepLocal) {
          await clearProgress()
          await setKv('owner', null)
          await appRef.current.reloadProgress()
        }
      },
      remoteRecordings,
      uploadRecording: async (rec) => {
        if (!supabase || !userId) return
        await uploadRecording(supabase, userId, rec)
      },
      downloadRecording: async (remote) => {
        if (!supabase) return null
        return downloadRecording(supabase, remote)
      },
      deleteRemoteRecording: async (surah) => {
        if (!supabase || !userId) return
        await deleteRemoteRecording(supabase, userId, surah)
        setRemoteRecordings((list) => list.filter((r) => r.surah !== surah))
      },
      deleteCloud: async () => {
        if (!supabase || !userId) return
        await deleteAllRemoteRecordings(supabase, userId).catch(() => undefined)
        setRemoteRecordings([])
        await deleteCloudData(supabase, userId)
        await setKv('sync', null)
      },
      deleteAccount: async () => {
        if (!supabase || !userId) return
        await deleteAllRemoteRecordings(supabase, userId).catch(() => undefined)
        setRemoteRecordings([])
        const { error } = await supabase.rpc('delete_own_account')
        if (error) throw error
        await supabase.auth.signOut({ scope: 'local' })
        await markAllUnsynced()
        await setKv('owner', null)
        await setKv('sync', null)
        await setKv('lastSync', null)
        setStatus({ kind: 'idle' })
      },
    }),
    [session, status, run, userId, linkError, remoteRecordings],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
