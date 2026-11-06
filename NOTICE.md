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

The quarter, juz and page boundaries come from Tanzil's metadata (CC BY), with
one correction documented in the README and recorded in the data file.

## Boundary cross-check: quran.com

`tests/fixtures/qurancom-boundaries.json` lists juz, rub' al-hizb and page
starting positions fetched from the [quran.com API](https://api.quran.com),
used only to check the Tanzil data in tests.

## Typefaces

- **Amiri Quran**, © Khaled Hosny, SIL Open Font License 1.1, via `@fontsource/amiri-quran`.
- **Readex Pro**, © The Readex Pro Project Authors, SIL Open Font License 1.1, via `@fontsource-variable/readex-pro`.
