import { Link } from 'react-router'
import { useI18n } from '../i18n/I18n'
import { reportUrl } from '../lib/report'

/** What happens to the user's data, in plain words. */
export function Privacy() {
  const { t } = useI18n()
  const report = reportUrl('Privacy question')
  return (
    <article className="stack prose">
      <h1>{t.privacy.title}</h1>
      <p>{t.privacy.intro}</p>
      {t.privacy.sections.map((s) => (
        <section key={s.h} className="section">
          <h2>{s.h}</h2>
          {s.p.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
      {report && (
        <p>
          <a href={report} target="_blank" rel="noreferrer">
            {t.privacy.contact}
          </a>
        </p>
      )}
      <Link to="/settings#about" className="btn btn--block">
        {t.privacy.back}
      </Link>
    </article>
  )
}
