import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { AppProvider } from './app/AppContext'
import { SyncProvider } from './app/SyncContext'
import { FocusContext } from './app/focus'
import { useI18n } from './i18n/I18n'
import { GridIcon, LawhIcon, SlidersIcon } from './components/Icons'
import { ToastProvider, useToast } from './components/Toast'
import { Practice } from './screens/Practice'
import { Quiz } from './screens/Quiz'
import { Progress } from './screens/Progress'
import { Settings } from './screens/Settings'
import { Memorized } from './screens/Memorized'

function Wordmark() {
  const { t } = useI18n()
  return (
    <span className="wordmark">
      <span className="wordmark__ar" lang="ar">
        مراجعة
      </span>
      {t.dir === 'ltr' && <span className="wordmark__en">{t.appName}</span>}
    </span>
  )
}

function Splash({ state }: { state: 'loading' | 'error' }) {
  const { t } = useI18n()
  return (
    <div className="splash">
      <div className="stack" style={{ alignItems: 'center', gap: '1rem' }}>
        <Wordmark />
        {state === 'loading' ? (
          <p className="muted" role="status">
            {t.loading}
          </p>
        ) : (
          <>
            <p role="alert">{t.loadFailed}</p>
            <button type="button" className="btn" onClick={() => location.reload()}>
              {t.reload}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function UpdatePrompt() {
  const { t } = useI18n()
  const toast = useToast()
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (needRefresh) {
      toast({
        text: t.pwa.update,
        duration: 0,
        action: {
          label: t.pwa.reload,
          run: () => void updateServiceWorker(true),
        },
      })
    }
  }, [needRefresh, t, toast, updateServiceWorker])

  useEffect(() => {
    if (offlineReady) toast({ text: t.pwa.offline })
  }, [offlineReady, t, toast])

  return null
}

function Shell() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const [inQuiz, setFocus] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="wordmark" aria-label={t.appName}>
          <Wordmark />
        </NavLink>
        {!inQuiz && (
          <nav className="nav" aria-label={t.appName}>
            <NavLink to="/" end>
              <LawhIcon />
              {t.nav.practice}
            </NavLink>
            <NavLink to="/progress">
              <GridIcon />
              {t.nav.progress}
            </NavLink>
            <NavLink to="/settings">
              <SlidersIcon />
              {t.nav.settings}
            </NavLink>
          </nav>
        )}
      </header>
      <main className="main" style={inQuiz ? { paddingBottom: '1.5rem' } : undefined}>
        <FocusContext.Provider value={setFocus}>
          <Routes>
            <Route path="/" element={<Practice />} />
            <Route path="/quiz" element={<Quiz />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/memorized" element={<Memorized />} />
            <Route path="*" element={<Practice />} />
          </Routes>
        </FocusContext.Provider>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider splash={(state) => <Splash state={state} />}>
      <SyncProvider>
        <ToastProvider>
          <HashRouter>
            <Shell />
          </HashRouter>
          <UpdatePrompt />
        </ToastProvider>
      </SyncProvider>
    </AppProvider>
  )
}
