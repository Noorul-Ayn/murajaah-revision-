import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadQuran, type Quran } from '../lib/quran'
import type { ItemId, Mode } from '../lib/items'
import type { Grade3, ItemState } from '../lib/srs'
import type { Settings } from '../lib/settings'
import { addReview, getAllStates, getSettings, putSettings } from '../storage/db'
import { I18nProvider } from '../i18n/I18n'

export interface App {
  quran: Quran
  settings: Settings
  states: ReadonlyMap<ItemId, ItemState>
  /** Changes settings and stamps them so the newest copy wins when syncing. */
  updateSettings: (patch: Partial<Omit<Settings, 'updatedAt'>>) => void
  /** Applies settings that came from sync or a backup without re-stamping them. */
  replaceSettings: (settings: Settings) => void
  recordAnswer: (itemId: ItemId, grade: Grade3, mode: Mode) => Promise<ItemState>
  reloadProgress: () => Promise<void>
  /** Increments on every local change; the sync layer watches it. */
  changes: number
}

const AppContext = createContext<App | null>(null)

export function useApp(): App {
  const app = useContext(AppContext)
  if (!app) throw new Error('useApp outside AppProvider')
  return app
}

type Boot =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; quran: Quran; settings: Settings; states: Map<ItemId, ItemState> }

function applyDocumentSettings(s: Settings) {
  const root = document.documentElement
  root.lang = s.lang
  root.dir = s.lang === 'ar' ? 'rtl' : 'ltr'
  root.dataset.theme = s.theme
  root.dataset.textSize = s.textSize
  document.title = s.lang === 'ar' ? 'مراجعة' : 'Murajaah'
}

export function AppProvider({
  children,
  splash,
}: {
  children: ReactNode
  splash: (state: 'loading' | 'error') => ReactNode
}) {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' })
  const [settings, setSettings] = useState<Settings | null>(null)
  const [states, setStates] = useState<Map<ItemId, ItemState>>(new Map())
  const [changes, setChanges] = useState(0)

  useEffect(() => {
    let cancelled = false
    getSettings()
      .then((s) => {
        if (cancelled) return
        applyDocumentSettings(s)
        setSettings(s)
        return Promise.all([loadQuran(), getAllStates()]).then(([quran, st]) => {
          if (cancelled) return
          setStates(st)
          setBoot({ status: 'ready', quran, settings: s, states: st })
        })
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) setBoot({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (settings) applyDocumentSettings(settings)
  }, [settings])

  const updateSettings = useCallback((patch: Partial<Omit<Settings, 'updatedAt'>>) => {
    setSettings((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch, updatedAt: Math.max(Date.now(), prev.updatedAt + 1) }
      void putSettings(next)
      return next
    })
    setChanges((c) => c + 1)
  }, [])

  const replaceSettings = useCallback((next: Settings) => {
    setSettings(next)
    void putSettings(next)
  }, [])

  const recordAnswer = useCallback(async (itemId: ItemId, grade: Grade3, mode: Mode) => {
    const state = await addReview({
      id: crypto.randomUUID(),
      itemId,
      grade,
      mode,
      at: Date.now(),
      synced: 0,
    })
    setStates((prev) => new Map(prev).set(itemId, state))
    setChanges((c) => c + 1)
    return state
  }, [])

  const reloadProgress = useCallback(async () => {
    setStates(await getAllStates())
  }, [])

  const value = useMemo<App | null>(
    () =>
      boot.status === 'ready' && settings
        ? {
            quran: boot.quran,
            settings,
            states,
            updateSettings,
            replaceSettings,
            recordAnswer,
            reloadProgress,
            changes,
          }
        : null,
    [boot, settings, states, updateSettings, replaceSettings, recordAnswer, reloadProgress, changes],
  )

  const lang = settings?.lang ?? (navigator.language.startsWith('ar') ? 'ar' : 'en')
  return (
    <I18nProvider lang={lang}>
      {value ? (
        <AppContext.Provider value={value}>{children}</AppContext.Provider>
      ) : (
        splash(boot.status === 'error' ? 'error' : 'loading')
      )}
    </I18nProvider>
  )
}
