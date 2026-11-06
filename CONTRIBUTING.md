# Contributing to Murajaah

Thank you for helping. Small, focused changes are easiest to review.

## Setup

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run check      # typecheck, lint, formatting, unit tests
npm run test:e2e   # end-to-end tests (first time: npx playwright install chromium)
```

CI runs the same checks on every pull request.

## Ground rules

- **The Qur'an text is never edited by hand.** `src/data/quran-hafs.json` is generated from the verbatim Tanzil files by `npm run data:build`. Tanzil's licence forbids changing the text. If you believe there is an error, open an issue with the surah and ayah and a reference to a printed mushaf.
- **Boundary changes need evidence.** A change to a rub', juz or page boundary must say which mushaf it follows, and it must keep `tests/data.test.ts` passing or update it with an explanation.
- **Both languages.** New interface text goes in `src/i18n/strings.ts` in both English and Arabic. Arabic counts use the plural forms helper.
- **Accessible by default.** Controls are real buttons, inputs and links; everything works with a keyboard and a screen reader. Check the layout in both directions (Arabic is right-to-left).
- **Database changes** go in a new file in `supabase/migrations/`. Never edit a migration that has already been released. Add a case to `tests/migration.test.ts`.

## Commit messages

Use the imperative mood and say what changes for the user, e.g. "Show the surah name as a hint in link mode".
