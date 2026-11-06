import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { ReaderState } from './MushafPage'
import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { verseLabel } from '../i18n/labels'
import { JUZ_COUNT } from '../lib/quran'
import { foldSearch } from '../lib/search'
import { openingText } from '../lib/text'
import { getKv } from '../storage/db'
import { Segmented } from '../components/controls'
import { BookTile, MicTile } from '../components/Art'

export function MushafIndex() {
  const { quran } = useApp()
  const i18n = useI18n()
  const { t, num } = i18n
  const [tab, setTab] = useState<'surahs' | 'juz'>('surahs')
  const [query, setQuery] = useState('')
  const [lastPage, setLastPage] = useState<number | null>(null)

  useEffect(() => {
    void getKv<number>('lastPage').then((p) => setLastPage(typeof p === 'number' ? p : null))
  }, [])

  const surahs = useMemo(() => {
    const q = foldSearch(query)
    if (!q) return quran.surahs
    return quran.surahs.filter(
      (s) =>
        foldSearch(s.name).includes(q) ||
        foldSearch(s.tname).includes(q) ||
        foldSearch(s.ename).includes(q) ||
        String(s.n) === query.trim(),
    )
  }, [query, quran])

  return (
    <div className="stack">
      <h1>{t.mushaf.title}</h1>

      {lastPage && (
        <Link to={`/mushaf/${lastPage}`} className="continue continue--tile" data-tone="iris">
          <BookTile />
          <span className="continue__label">{t.mushaf.continue}</span>
          <span className="continue__where">
            {t.mushaf.continueAt(num(lastPage), i18n.surahName(quran.surahOf(quran.pageRange(lastPage)[0])))}
          </span>
        </Link>
      )}

      <Link to="/recite" className="continue continue--tile" data-tone="orchid">
        <MicTile />
        <span className="continue__label">{t.recite.title}</span>
        <span className="continue__where">{t.recite.open}</span>
      </Link>

      <Segmented
        legend={t.mushaf.title}
        value={tab}
        options={[
          { value: 'surahs' as const, label: t.mushaf.surahs },
          { value: 'juz' as const, label: t.mushaf.juz },
        ]}
        onChange={setTab}
      />

      {tab === 'surahs' ? (
        <>
          <input
            className="input"
            type="search"
            placeholder={t.mushaf.search}
            aria-label={t.mushaf.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {surahs.length === 0 ? (
            <p className="muted">{t.mushaf.noMatch}</p>
          ) : (
            <ul className="surahs surahs--index">
              {surahs.map((s) => {
                const page = quran.pageOf(s.start)
                return (
                  <li key={s.n}>
                    <Link to={`/mushaf/${page}`} state={{ from: s.start } satisfies ReaderState} className="surah-row">
                      <span className="surah-row__n">{num(s.n)}</span>
                      <span>
                        <span className="surah-row__name" lang="ar" translate="no">
                          {s.name}
                        </span>
                        <br />
                        <span className="surah-row__meta">
                          {i18n.lang === 'en' ? `${s.tname}${t.sep}` : ''}
                          {s.type === 'meccan' ? t.mushaf.meccan : t.mushaf.medinan}
                          {t.sep}
                          {t.memorized.ayahs(s.ayahs, num(s.ayahs))}
                        </span>
                      </span>
                      <span className="surah-row__meta">{num(page)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      ) : (
        <ul className="surahs surahs--index">
          {Array.from({ length: JUZ_COUNT }, (_, j) => {
            const [first] = quran.juzRange(j + 1)
            const page = quran.pageOf(first)
            return (
              <li key={j}>
                <Link to={`/mushaf/${page}`} state={{ from: first } satisfies ReaderState} className="surah-row">
                  <span className="surah-row__n">{num(j + 1)}</span>
                  <span>
                    <span className="surah-row__name" lang="ar" translate="no">
                      {openingText(quran.text(first), 4)}
                    </span>
                    <br />
                    <span className="surah-row__meta">{verseLabel(i18n, quran, first)}</span>
                  </span>
                  <span className="surah-row__meta">{num(page)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
