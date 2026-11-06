import { useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { EXTRA_AYAHS, PROMPT_WORDS, type Lang, type TextSize, type Theme } from '../lib/settings'
import { clearProgress, exportBackup, importBackup } from '../storage/db'
import { Dialog, Segmented, Stepper } from '../components/controls'
import { useToast } from '../components/Toast'
import { Account } from './Account'

const REPO_URL = import.meta.env.VITE_REPO_URL as string | undefined

export function Settings() {
  const app = useApp()
  const { settings, updateSettings, quran } = app
  const { t, num } = useI18n()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const download = async () => {
    const backup = await exportBackup()
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `murajaah-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const restore = async (file: File) => {
    try {
      const { added, settings: next } = await importBackup(JSON.parse(await file.text()))
      app.replaceSettings(next)
      await app.reloadProgress()
      toast({ text: t.settings.imported(added, num(added)) })
    } catch {
      toast({ text: t.settings.importFailed })
    }
  }

  return (
    <div className="stack">
      <h1>{t.settings.title}</h1>

      <section className="section">
        <Segmented<Lang>
          legend={t.settings.language}
          value={settings.lang}
          options={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(lang) => updateSettings({ lang })}
        />
        <Segmented<Theme>
          legend={t.settings.theme}
          value={settings.theme}
          options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t.settings.themes[v] }))}
          onChange={(theme) => updateSettings({ theme })}
        />
        <Segmented<TextSize>
          legend={t.settings.textSize}
          value={settings.textSize}
          options={(['m', 'l', 'xl'] as const).map((v) => ({ value: v, label: t.settings.textSizes[v] }))}
          onChange={(textSize) => updateSettings({ textSize })}
        />
        <div className="lawh" style={{ paddingBlock: '2rem 1rem' }}>
          <p className="quran" lang="ar" dir="rtl">
            {quran.text(quran.indexOf(67, 1))}
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="ayah-h">
        <h2 id="ayah-h">{t.settings.ayahMode}</h2>
        <Stepper
          label={t.settings.promptWords}
          value={settings.promptWords}
          min={PROMPT_WORDS.min}
          max={PROMPT_WORDS.max}
          onChange={(promptWords) => updateSettings({ promptWords })}
        />
        <Stepper
          label={t.settings.extraAyahs}
          value={settings.extraAyahs}
          min={EXTRA_AYAHS.min}
          max={EXTRA_AYAHS.max}
          onChange={(extraAyahs) => updateSettings({ extraAyahs })}
        />
      </section>

      <Account />

      <section className="section" aria-labelledby="backup-h">
        <h2 id="backup-h">{t.settings.backup}</h2>
        <p className="muted small">{t.settings.backupBody}</p>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn" onClick={() => void download()}>
            {t.settings.exportBtn}
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            {t.settings.importBtn}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void restore(f)
              e.target.value = ''
            }}
          />
        </div>
        <div>
          <button type="button" className="btn btn--quiet btn--danger" onClick={() => setConfirmReset(true)}>
            {t.settings.reset}
          </button>
        </div>
      </section>

      <section className="section" aria-labelledby="about-h">
        <h2 id="about-h">{t.settings.about}</h2>
        <p className="muted small">{t.settings.aboutBody}</p>
        <p className="row small" style={{ justifyContent: 'flex-start' }}>
          <a href={quran.data.source.url} target="_blank" rel="noreferrer">
            {t.settings.tanzil}
          </a>
          {REPO_URL && (
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              {t.settings.source}
            </a>
          )}
        </p>
        <p className="muted small">{t.settings.version(__APP_VERSION__)}</p>
      </section>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t.settings.resetTitle}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
              {t.settings.cancel}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={async () => {
                setConfirmReset(false)
                await clearProgress()
                await app.reloadProgress()
                toast({ text: t.settings.resetDone })
              }}
            >
              {t.settings.delete}
            </button>
          </>
        }
      >
        <p>{t.settings.resetBody}</p>
      </Dialog>
    </div>
  )
}
