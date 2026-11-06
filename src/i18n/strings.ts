import type { Mode } from '../lib/items'
import type { Order } from '../lib/session'
import type { Strength, Grade3 } from '../lib/srs'
import type { TextSize, Theme } from '../lib/settings'

/**
 * Interface text. English defines the shape; Arabic must provide every key.
 * Functions receive already-formatted numbers (Arabic-Indic digits in Arabic).
 */

type Plural = (n: number, formatted: string) => string

const arPlural =
  (forms: { one: string; two: string; few: string; many: string; other: string }): Plural =>
  (n, f) => {
    const rule = new Intl.PluralRules('ar').select(n)
    if (rule === 'one') return forms.one
    if (rule === 'two') return forms.two
    if (rule === 'few') return forms.few.replace('{n}', f)
    if (rule === 'many') return forms.many.replace('{n}', f)
    return forms.other.replace('{n}', f)
  }

const enPlural =
  (one: string, other: string): Plural =>
  (n, f) =>
    (n === 1 ? one : other).replace('{n}', f)

const en = {
  dir: 'ltr' as 'ltr' | 'rtl',
  /** Separator between items in a short inline list. */
  sep: ', ',
  appName: 'Murajaah',
  tagline: "Revise your hifz by rub' and by ayah",
  loading: 'Loading the mushaf…',
  loadFailed: 'The Qur’an text could not be loaded. Check your connection and reload.',
  reload: 'Reload',
  nav: { practice: 'Practice', progress: 'Progress', settings: 'Settings' },

  memorized: {
    title: 'What you’ve memorized',
    empty: 'Choose the parts you’ve memorized. Questions only come from there.',
    choose: 'Choose what you’ve memorized',
    edit: 'Edit',
    ayahs: enPlural('1 ayah', '{n} ayahs'),
    quarters: enPlural('1 rub’', '{n} rub’s'),
    tabs: { juz: 'Juz', hizb: 'Hizb', surah: 'Surahs', range: 'Ayah range' },
    search: 'Search surahs',
    noMatch: 'No surah matches that search.',
    from: 'From',
    to: 'To',
    surah: 'Surah',
    ayah: 'Ayah',
    addRange: 'Add range',
    selected: 'Selected',
    nothingSelected: 'Nothing selected yet.',
    remove: (label: string) => `Remove ${label}`,
    clear: 'Clear all',
    done: 'Done',
  },

  modes: {
    ayah: { title: 'Continue the ayah', body: 'You see the first words of an ayah and recite the rest.' },
    open: { title: 'Start of a rub’', body: 'You see a rub’ by its name and recite how it begins.' },
    name: { title: 'Name the rub’', body: 'You see how a rub’ begins and pick which one it is.' },
    link: { title: 'Link the quarters', body: 'You see the last ayah of a rub’ and recite how the next one begins.' },
  } satisfies Record<Mode, { title: string; body: string }>,

  setup: {
    mode: 'What to practice',
    from: 'Ask from',
    allMemorized: 'Everything I’ve memorized',
    questions: 'Questions',
    order: 'Order',
    orders: { smart: 'Weakest first', random: 'Random', mushaf: 'Mushaf order' } satisfies Record<Order, string>,
    start: enPlural('Start 1 question', 'Start {n} questions'),
    due: enPlural('1 due for review', '{n} due for review'),
    available: enPlural('1 to choose from', '{n} to choose from'),
    nothing: 'There’s nothing to ask from this range in this mode.',
    nothingLink: 'Linking needs two neighbouring rub’s that you’ve memorized.',
  },

  quiz: {
    end: 'End session',
    counter: (i: string, n: string) => `${i} of ${n}`,
    reciteRest: 'Recite the rest of the ayah',
    reciteRestAnd: enPlural('Recite the rest, then the next ayah', 'Recite the rest, then the next {n} ayahs'),
    reciteOpening: 'Recite how this rub’ begins',
    whichRub: 'Which rub’ begins like this?',
    whatNext: 'This ayah ends a rub’. Recite how the next one begins.',
    nextWord: 'Show next word',
    showSurah: 'Show surah',
    showRub: 'Show which rub’',
    reveal: 'Show answer',
    hidden: enPlural('1 word hidden', '{n} words hidden'),
    grades: { missed: 'Missed', hesitated: 'Hesitated', perfect: 'Perfect' } satisfies Record<Grade3, string>,
    howDid: 'How did it go?',
    hintCap: 'You used a hint, so the best you can mark is hesitated.',
    dontKnow: 'I don’t know',
    correct: 'Correct.',
    itWas: (label: string) => `It was ${label}.`,
    next: 'Next',
    keys: 'Space shows the answer. 1, 2 and 3 grade it.',
  },

  where: {
    surahAyah: (surah: string, ayah: string) => `${surah} ${ayah}`,
    page: (n: string) => `Page ${n}`,
    juz: (n: string) => `Juz ${n}`,
    ayahRange: (from: string, to: string) => `${from} to ${to}`,
  },

  quarter: (hizb: string, part: 1 | 2 | 3 | 4) =>
    ({ 1: `Hizb ${hizb}`, 2: `¼ Hizb ${hizb}`, 3: `½ Hizb ${hizb}`, 4: `¾ Hizb ${hizb}` })[part],

  summary: {
    title: 'Session complete',
    counts: (perfect: string, hesitated: string, missed: string) =>
      `${perfect} perfect, ${hesitated} hesitated, ${missed} missed`,
    toReview: 'To review',
    clean: 'No mistakes this time.',
    again: 'Practice these again',
    back: 'Back to practice',
  },

  progress: {
    title: 'Progress',
    memorized: 'Ayahs memorized',
    answers: 'Answers given',
    today: 'Answered today',
    streak: 'Day streak',
    days: enPlural('1 day', '{n} days'),
    mapTitle: 'Every rub’, juz by juz',
    show: 'Show',
    all: 'All modes',
    legend: {
      out: 'Not memorized',
      none: 'Not tested yet',
      weak: 'Weak',
      shaky: 'Shaky',
      good: 'Good',
      strong: 'Strong',
    } satisfies Record<Strength | 'out', string>,
    tested: (k: string, n: string) => `${k} of ${n} tested`,
    practice: 'Practice this rub’',
    close: 'Close',
    emptyHint: 'Choose what you’ve memorized and the map fills in as you practice.',
  },

  settings: {
    title: 'Settings',
    language: 'Language',
    theme: 'Appearance',
    themes: { system: 'Match device', light: 'Light', dark: 'Dark' } satisfies Record<Theme, string>,
    textSize: 'Qur’an text size',
    textSizes: { m: 'Medium', l: 'Large', xl: 'Extra large' } satisfies Record<TextSize, string>,
    ayahMode: 'Continue the ayah',
    promptWords: 'Words shown at the start',
    extraAyahs: 'Ayahs to keep reciting after it',
    fewer: 'Fewer',
    more: 'More',
    backup: 'Backup',
    backupBody:
      'Download your progress as a file, or restore it from one. Restoring adds to what’s here; nothing is overwritten.',
    exportBtn: 'Download backup',
    importBtn: 'Restore from backup',
    imported: enPlural('Restored 1 answer.', 'Restored {n} answers.'),
    importFailed: 'That file isn’t a Murajaah backup.',
    reset: 'Delete progress on this device',
    resetTitle: 'Delete progress on this device?',
    resetBody: 'All answers stored on this device are removed. Progress already synced to your account stays there.',
    resetDone: 'Progress on this device was deleted.',
    about: 'About',
    aboutBody:
      'Murajaah is free and open source. The Qur’an text is the Tanzil Project’s verified Uthmani text (Hafs), used unchanged. Rub’, juz and page boundaries are checked against the in-text rub’ signs and quran.com.',
    tanzil: 'Tanzil Project',
    source: 'Source code',
    version: (v: string) => `Version ${v}`,
    cancel: 'Cancel',
    delete: 'Delete',
  },

  account: {
    title: 'Account and sync',
    pitch: 'Sign in to keep your progress in sync across your devices. Without an account, it stays on this device.',
    email: 'Email',
    sendCode: 'Email me a sign-in code',
    sending: 'Sending…',
    codeSent: (email: string) => `A 6-digit code was sent to ${email}.`,
    code: 'Sign-in code',
    verify: 'Sign in',
    verifying: 'Signing in…',
    otherEmail: 'Use a different email',
    signedIn: (email: string) => `Signed in as ${email}`,
    syncing: 'Syncing…',
    synced: (when: string) => `Synced ${when}`,
    neverSynced: 'Not synced yet',
    offline: 'Offline. Changes sync when you’re back online.',
    failed: (msg: string) => `Sync failed: ${msg}. It will try again.`,
    syncNow: 'Sync now',
    signOut: 'Sign out',
    signOutTitle: 'Sign out?',
    signOutBody: 'Your progress stays in your account. Choose whether to keep a copy on this device.',
    signOutKeep: 'Keep it on this device',
    signOutRemove: 'Remove it from this device',
    deleteCloud: 'Delete my synced data',
    deleteCloudTitle: 'Delete your synced data?',
    deleteCloudBody: 'All answers and settings stored in your account are deleted. Progress on this device is kept.',
    deleteCloudDone: 'Your synced data was deleted.',
    deleteAccount: 'Delete account',
    deleteAccountTitle: 'Delete your account?',
    deleteAccountBody:
      'Your account and everything synced to it are deleted for good. Progress on this device is kept.',
    deleteAccountDone: 'Your account was deleted.',
    badEmail: 'Enter a full email address, like name@example.com.',
    badCode: 'That code didn’t work. Check it, or send a new one.',
    error: (msg: string) => `Something went wrong: ${msg}`,
  },

  pwa: {
    update: 'A new version is ready.',
    reload: 'Reload',
    offline: 'Ready to use offline.',
    dismiss: 'Dismiss',
  },
}

export type Strings = typeof en

const ar: Strings = {
  dir: 'rtl',
  sep: '، ',
  appName: 'مراجعة',
  tagline: 'راجِع حفظك بالأرباع والآيات',
  loading: 'جارٍ تحميل المصحف…',
  loadFailed: 'تعذّر تحميل نص القرآن. تحقّق من الاتصال ثم أعد التحميل.',
  reload: 'أعد التحميل',
  nav: { practice: 'التسميع', progress: 'التقدّم', settings: 'الإعدادات' },

  memorized: {
    title: 'محفوظك',
    empty: 'اختر ما تحفظه من القرآن، ولن تأتيك الأسئلة إلا منه.',
    choose: 'اختر محفوظك',
    edit: 'تعديل',
    ayahs: arPlural({ one: 'آية واحدة', two: 'آيتان', few: '{n} آيات', many: '{n} آية', other: '{n} آية' }),
    quarters: arPlural({ one: 'ربع واحد', two: 'ربعان', few: '{n} أرباع', many: '{n} ربعًا', other: '{n} ربع' }),
    tabs: { juz: 'الأجزاء', hizb: 'الأحزاب', surah: 'السور', range: 'نطاق آيات' },
    search: 'ابحث عن سورة',
    noMatch: 'لا توجد سورة بهذا الاسم.',
    from: 'من',
    to: 'إلى',
    surah: 'السورة',
    ayah: 'الآية',
    addRange: 'أضف النطاق',
    selected: 'المختار',
    nothingSelected: 'لم تختر شيئًا بعد.',
    remove: (label) => `احذف ${label}`,
    clear: 'امسح الكل',
    done: 'تم',
  },

  modes: {
    ayah: { title: 'أكمل الآية', body: 'تظهر لك أوائل كلمات آية فتكمل تلاوتها.' },
    open: { title: 'أول الربع', body: 'يظهر لك اسم الربع فتتلو أوله.' },
    name: { title: 'سمِّ الربع', body: 'يظهر لك أول الربع فتختار أيّ ربع هو.' },
    link: { title: 'ربط الأرباع', body: 'تظهر لك آخر آية في الربع فتتلو أول الربع الذي يليه.' },
  },

  setup: {
    mode: 'نوع التسميع',
    from: 'الأسئلة من',
    allMemorized: 'كل محفوظي',
    questions: 'عدد الأسئلة',
    order: 'الترتيب',
    orders: { smart: 'الأضعف أولًا', random: 'عشوائي', mushaf: 'ترتيب المصحف' },
    start: arPlural({
      one: 'ابدأ سؤالًا واحدًا',
      two: 'ابدأ سؤالين',
      few: 'ابدأ {n} أسئلة',
      many: 'ابدأ {n} سؤالًا',
      other: 'ابدأ {n} سؤال',
    }),
    due: arPlural({
      one: 'سؤال واحد حان وقت مراجعته',
      two: 'سؤالان حان وقت مراجعتهما',
      few: '{n} أسئلة حان وقت مراجعتها',
      many: '{n} سؤالًا حان وقت مراجعتها',
      other: '{n} سؤال حان وقت مراجعتها',
    }),
    available: arPlural({
      one: 'سؤال واحد متاح',
      two: 'سؤالان متاحان',
      few: '{n} أسئلة متاحة',
      many: '{n} سؤالًا متاحًا',
      other: '{n} سؤال متاح',
    }),
    nothing: 'لا توجد أسئلة من هذا النطاق في هذا النوع.',
    nothingLink: 'الربط يحتاج ربعين متتاليين من محفوظك.',
  },

  quiz: {
    end: 'إنهاء',
    counter: (i, n) => `${i} من ${n}`,
    reciteRest: 'أكمل الآية',
    reciteRestAnd: arPlural({
      one: 'أكمل الآية ثم الآية التي بعدها',
      two: 'أكمل الآية ثم الآيتين اللتين بعدها',
      few: 'أكمل الآية ثم {n} آيات بعدها',
      many: 'أكمل الآية ثم {n} آية بعدها',
      other: 'أكمل الآية ثم {n} آية بعدها',
    }),
    reciteOpening: 'اتلُ أول هذا الربع',
    whichRub: 'أيّ ربع يبدأ بهذا؟',
    whatNext: 'هذه آخر آية في الربع، فاتلُ أول الربع الذي يليه.',
    nextWord: 'أظهر الكلمة التالية',
    showSurah: 'أظهر السورة',
    showRub: 'أظهر الربع',
    reveal: 'أظهر الجواب',
    hidden: arPlural({
      one: 'كلمة واحدة مخفية',
      two: 'كلمتان مخفيتان',
      few: '{n} كلمات مخفية',
      many: '{n} كلمة مخفية',
      other: '{n} كلمة مخفية',
    }),
    grades: { missed: 'أخطأت', hesitated: 'تردّدت', perfect: 'أتقنت' },
    howDid: 'كيف كان تسميعك؟',
    hintCap: 'استعنت بتلميح، فأعلى ما يمكنك اختياره «تردّدت».',
    dontKnow: 'لا أعرف',
    correct: 'صحيح.',
    itWas: (label) => `الصواب: ${label}.`,
    next: 'التالي',
    keys: 'المسافة تُظهر الجواب، و١ و٢ و٣ للتقييم.',
  },

  where: {
    surahAyah: (surah, ayah) => `${surah} ${ayah}`,
    page: (n) => `صفحة ${n}`,
    juz: (n) => `الجزء ${n}`,
    ayahRange: (from, to) => `${from} إلى ${to}`,
  },

  quarter: (hizb, part) =>
    ({ 1: `الحزب ${hizb}`, 2: `ربع الحزب ${hizb}`, 3: `نصف الحزب ${hizb}`, 4: `ثلاثة أرباع الحزب ${hizb}` })[part],

  summary: {
    title: 'انتهى التسميع',
    counts: (perfect, hesitated, missed) => `أتقنت ${perfect}، وتردّدت في ${hesitated}، وأخطأت في ${missed}`,
    toReview: 'للمراجعة',
    clean: 'لا أخطاء هذه المرة.',
    again: 'سمّعها مرة أخرى',
    back: 'العودة إلى التسميع',
  },

  progress: {
    title: 'التقدّم',
    memorized: 'آيات محفوظة',
    answers: 'إجابات',
    today: 'إجابات اليوم',
    streak: 'أيام متتالية',
    days: arPlural({ one: 'يوم واحد', two: 'يومان', few: '{n} أيام', many: '{n} يومًا', other: '{n} يوم' }),
    mapTitle: 'الأرباع في كل جزء',
    show: 'اعرض',
    all: 'كل الأنواع',
    legend: {
      out: 'غير محفوظ',
      none: 'لم يُختبر بعد',
      weak: 'ضعيف',
      shaky: 'متوسط',
      good: 'جيد',
      strong: 'متقن',
    },
    tested: (k, n) => `اختُبر ${k} من ${n}`,
    practice: 'سمّع هذا الربع',
    close: 'إغلاق',
    emptyHint: 'اختر محفوظك، وستمتلئ الخريطة كلما سمّعت.',
  },

  settings: {
    title: 'الإعدادات',
    language: 'اللغة',
    theme: 'المظهر',
    themes: { system: 'حسب الجهاز', light: 'فاتح', dark: 'داكن' },
    textSize: 'حجم خط المصحف',
    textSizes: { m: 'متوسط', l: 'كبير', xl: 'كبير جدًا' },
    ayahMode: 'أكمل الآية',
    promptWords: 'عدد الكلمات الظاهرة من أول الآية',
    extraAyahs: 'عدد الآيات التي تكملها بعدها',
    fewer: 'أقل',
    more: 'أكثر',
    backup: 'نسخة احتياطية',
    backupBody: 'نزّل تقدّمك في ملف أو استعده منه. الاستعادة تضيف إلى ما هنا ولا تحذف شيئًا.',
    exportBtn: 'نزّل نسخة احتياطية',
    importBtn: 'استعد من نسخة احتياطية',
    imported: arPlural({
      one: 'استُعيدت إجابة واحدة.',
      two: 'استُعيدت إجابتان.',
      few: 'استُعيدت {n} إجابات.',
      many: 'استُعيدت {n} إجابة.',
      other: 'استُعيدت {n} إجابة.',
    }),
    importFailed: 'هذا الملف ليس نسخة احتياطية من «مراجعة».',
    reset: 'احذف التقدّم من هذا الجهاز',
    resetTitle: 'أتحذف التقدّم من هذا الجهاز؟',
    resetBody: 'ستُحذف كل الإجابات المحفوظة على هذا الجهاز. أما ما زامنته مع حسابك فيبقى فيه.',
    resetDone: 'حُذف التقدّم من هذا الجهاز.',
    about: 'عن التطبيق',
    aboutBody:
      '«مراجعة» تطبيق مجاني مفتوح المصدر. نص القرآن هو النص العثماني المدقّق من مشروع تنزيل (رواية حفص) دون أي تغيير، وحدود الأرباع والأجزاء والصفحات مطابَقة مع علامات الأرباع في النص ومع quran.com.',
    tanzil: 'مشروع تنزيل',
    source: 'الشيفرة المصدرية',
    version: (v) => `الإصدار ${v}`,
    cancel: 'إلغاء',
    delete: 'احذف',
  },

  account: {
    title: 'الحساب والمزامنة',
    pitch: 'سجّل الدخول لتتزامن مراجعتك بين أجهزتك. بدون حساب يبقى تقدّمك على هذا الجهاز فقط.',
    email: 'البريد الإلكتروني',
    sendCode: 'أرسل لي رمز الدخول',
    sending: 'جارٍ الإرسال…',
    codeSent: (email) => `أُرسل رمز من ٦ أرقام إلى ${email}.`,
    code: 'رمز الدخول',
    verify: 'دخول',
    verifying: 'جارٍ الدخول…',
    otherEmail: 'استخدم بريدًا آخر',
    signedIn: (email) => `مسجّل الدخول باسم ${email}`,
    syncing: 'جارٍ المزامنة…',
    synced: (when) => `تمت المزامنة ${when}`,
    neverSynced: 'لم تتم المزامنة بعد',
    offline: 'لا يوجد اتصال. ستتم المزامنة عند عودته.',
    failed: (msg) => `تعذّرت المزامنة: ${msg}. ستُعاد المحاولة.`,
    syncNow: 'زامن الآن',
    signOut: 'تسجيل الخروج',
    signOutTitle: 'أتسجّل الخروج؟',
    signOutBody: 'يبقى تقدّمك في حسابك. اختر هل تُبقي نسخة منه على هذا الجهاز.',
    signOutKeep: 'أبقِه على هذا الجهاز',
    signOutRemove: 'احذفه من هذا الجهاز',
    deleteCloud: 'احذف بياناتي المتزامنة',
    deleteCloudTitle: 'أتحذف بياناتك المتزامنة؟',
    deleteCloudBody: 'ستُحذف كل الإجابات والإعدادات المحفوظة في حسابك، ويبقى التقدّم على هذا الجهاز.',
    deleteCloudDone: 'حُذفت بياناتك المتزامنة.',
    deleteAccount: 'احذف الحساب',
    deleteAccountTitle: 'أتحذف حسابك؟',
    deleteAccountBody: 'سيُحذف حسابك وكل ما زامنته معه نهائيًا، ويبقى التقدّم على هذا الجهاز.',
    deleteAccountDone: 'حُذف حسابك.',
    badEmail: 'اكتب بريدًا إلكترونيًا كاملًا، مثل name@example.com.',
    badCode: 'هذا الرمز غير صحيح. تحقّق منه أو اطلب رمزًا جديدًا.',
    error: (msg) => `حدث خطأ: ${msg}`,
  },

  pwa: {
    update: 'نسخة جديدة جاهزة.',
    reload: 'حدّث',
    offline: 'التطبيق جاهز للعمل دون اتصال.',
    dismiss: 'إغلاق',
  },
}

export const STRINGS = { en, ar } as const
