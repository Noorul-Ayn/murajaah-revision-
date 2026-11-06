# Third-party material

## Qur'an text: Tanzil Project

`data/tanzil/` and `src/data/quran-hafs.json` contain the Tanzil Quran Text
(Uthmani, Version 1.1), © 2007–2026 Tanzil Project, licensed under
[Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).

Tanzil's terms of use:

- Verbatim copies may be copied and distributed, but **changing the text is not allowed**.
- The source (Tanzil Project) must be clearly indicated, with a link to
  [tanzil.net](https://tanzil.net) so users can keep track of changes.
- The copyright notice must be included in all verbatim copies and in files
  derived from or containing a substantial portion of the text.

Murajaah copies the ayah text byte for byte (checked by `tests/data.test.ts`),
keeps Tanzil's copyright block in `src/data/quran-hafs.json`, and credits and
links Tanzil in the app under Settings → About. Before changing anything in
`data/tanzil/` or the build script, re-read these terms.

`data/tanzil/quran-simple-clean.xml` and `src/data/quran-simple.json` contain
the Tanzil Quran Text (Simple Clean, Version 1.1) under the same terms. It is
used only to match recitation heard through the microphone and is never shown.

The quarter, juz and page boundaries come from Tanzil's metadata (CC BY), with
one correction documented in the README and recorded in the data file.

## English translations

`data/tanzil/trans/` and `src/data/translations/` contain two English
translations, downloaded from [tanzil.net/trans](https://tanzil.net/trans/)
and copied unchanged:

- **Saheeh International** (`en-sahih`), © Saheeh International. Tanzil's
  terms: "The translations provided at this page are for non-commercial
  purposes only. If used otherwise, you need to obtain necessary permission
  from the translator or the publisher." Murajaah is free and non-commercial.
  **The MIT licence does not extend to this translation.** A commercial fork
  must remove it or obtain permission from the publisher.
- **Pickthall** (`en-pickthall`), *The Meaning of the Glorious Koran* by
  Mohammed Marmaduke William Pickthall (1930). The translator died in 1936;
  the translation is in the public domain.

## Boundary cross-check: quran.com

`tests/fixtures/qurancom-boundaries.json` lists juz, rub' al-hizb and page
starting positions fetched from the [quran.com API](https://api.quran.com),
used only to check the Tanzil data in tests.

## Typefaces

- **Amiri Quran**, © Khaled Hosny, SIL Open Font License 1.1, via `@fontsource/amiri-quran`.
- **Readex Pro**, © The Readex Pro Project Authors, SIL Open Font License 1.1, via `@fontsource-variable/readex-pro`.
