/**
 * "Report a problem": opens a new GitHub issue in the app's repository with
 * the context filled in (never anything personal, like an email address).
 */

const REPO_URL = import.meta.env.VITE_REPO_URL as string | undefined

/** The repository's new-issue page with a title and body, or null when the build doesn't know its repository. */
export function reportUrl(title: string, details: readonly string[] = []): string | null {
  if (!REPO_URL) return null
  const body = [
    'What happened, and what did you expect?',
    '',
    '',
    '---',
    ...details,
    `App version: ${__APP_VERSION__}`,
    `Browser: ${typeof navigator === 'undefined' ? '' : navigator.userAgent}`,
  ].join('\n')
  const q = new URLSearchParams({ title, body })
  return `${REPO_URL.replace(/\/$/, '')}/issues/new?${q.toString()}`
}

export const PRIVACY_PATH = '/privacy'
