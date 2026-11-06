/**
 * Reciters, streamed ayah by ayah from EveryAyah.com (https://everyayah.com).
 * Each ayah is its own MP3, so playback can follow, highlight and repeat
 * single ayahs. The basmala before a surah is Al-Fatiha 1 by the same reciter.
 */

export interface Reciter {
  id: string
  name: string
  nameAr: string
  folder: string
}

export const RECITERS: readonly Reciter[] = [
  { id: 'alafasy', name: 'Mishary Rashid Alafasy', nameAr: 'مشاري راشد العفاسي', folder: 'Alafasy_128kbps' },
  {
    id: 'abdulbasit',
    name: 'Abdul Basit Abdul Samad',
    nameAr: 'عبد الباسط عبد الصمد',
    folder: 'Abdul_Basit_Murattal_192kbps',
  },
  { id: 'husary', name: 'Mahmoud Khalil Al-Husary', nameAr: 'محمود خليل الحصري', folder: 'Husary_128kbps' },
  {
    id: 'husary-muallim',
    name: 'Al-Husary, teaching recitation',
    nameAr: 'الحصري، المصحف المعلّم',
    folder: 'Husary_Muallim_128kbps',
  },
  {
    id: 'minshawi',
    name: 'Mohamed Siddiq Al-Minshawi',
    nameAr: 'محمد صديق المنشاوي',
    folder: 'Minshawy_Murattal_128kbps',
  },
  {
    id: 'sudais',
    name: 'Abdurrahman As-Sudais',
    nameAr: 'عبد الرحمن السديس',
    folder: 'Abdurrahmaan_As-Sudais_192kbps',
  },
  { id: 'shuraim', name: 'Saud Ash-Shuraim', nameAr: 'سعود الشريم', folder: 'Saood_ash-Shuraym_128kbps' },
  { id: 'muaiqly', name: 'Maher Al-Muaiqly', nameAr: 'ماهر المعيقلي', folder: 'MaherAlMuaiqly128kbps' },
  { id: 'ghamdi', name: 'Saad Al-Ghamdi', nameAr: 'سعد الغامدي', folder: 'Ghamadi_40kbps' },
  { id: 'basfar', name: 'Abdullah Basfar', nameAr: 'عبد الله بصفر', folder: 'Abdullah_Basfar_192kbps' },
  { id: 'hudhaify', name: 'Ali Al-Hudhaify', nameAr: 'علي الحذيفي', folder: 'Hudhaify_128kbps' },
  { id: 'ayyoub', name: 'Muhammad Ayyoub', nameAr: 'محمد أيوب', folder: 'Muhammad_Ayyoub_128kbps' },
  { id: 'dossary', name: 'Yasser Ad-Dossary', nameAr: 'ياسر الدوسري', folder: 'Yasser_Ad-Dussary_128kbps' },
  { id: 'qatami', name: 'Nasser Al-Qatami', nameAr: 'ناصر القطامي', folder: 'Nasser_Alqatami_128kbps' },
]

/** The reciter id for the user's own recordings. */
export const MINE = 'mine'

export const PLAY_REPEATS = [1, 2, 3, 5, 10] as const
export const PLAY_SPEEDS = [0.75, 1, 1.25] as const

const pad = (n: number) => String(n).padStart(3, '0')

export function ayahUrl(reciter: Reciter, surah: number, ayah: number): string {
  return `https://everyayah.com/data/${reciter.folder}/${pad(surah)}${pad(ayah)}.mp3`
}

export function reciterById(id: string): Reciter | undefined {
  return RECITERS.find((r) => r.id === id)
}

/** Surahs 1 and 9 have no basmala before them to play. */
export function playsBasmalaBefore(surah: number, ayah: number): boolean {
  return ayah === 1 && surah !== 1 && surah !== 9
}
