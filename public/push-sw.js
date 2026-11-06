/*
 * Murajaah's daily reminder, in the service worker: shows the notification
 * the reminder Edge Function sends, and opens the app when it is tapped.
 * Loaded into the generated service worker with importScripts.
 */

const arDigits = new Intl.NumberFormat('ar-EG')

function reminderText(lang, due) {
  if (lang === 'ar') {
    const n = arDigits.format(due ?? 0)
    const body =
      due == null
        ? 'حان وقت مراجعتك اليومية.'
        : due === 1
          ? 'سؤال واحد حان وقت مراجعته اليوم.'
          : due === 2
            ? 'سؤالان حان وقت مراجعتهما اليوم.'
            : due % 100 >= 3 && due % 100 <= 10
              ? `${n} أسئلة حان وقت مراجعتها اليوم.`
              : `${n} سؤالًا حان وقت مراجعتها اليوم.`
    return { title: 'مراجعة', body, dir: 'rtl' }
  }
  const body =
    due == null
      ? 'Time for your daily revision.'
      : due === 1
        ? '1 question is due today.'
        : `${due} questions are due today.`
  return { title: 'Murajaah', body, dir: 'ltr' }
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const lang = data.lang === 'ar' ? 'ar' : 'en'
  const due = typeof data.due === 'number' ? data.due : null
  const { title, body, dir } = reminderText(lang, due)
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      dir,
      lang,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'murajaah-daily',
      data: { url: self.registration.scope },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope))
      return open ? open.focus() : self.clients.openWindow(url)
    }),
  )
})
