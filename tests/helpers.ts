import data from '../src/data/quran-hafs.json'
import { Quran, type QuranData } from '../src/lib/quran'

export const quran = new Quran(data as unknown as QuranData)
