# Security

If you find a security problem, for example a way to read or change another account's synced data, please don't open a public issue. Report it privately through GitHub's **Security → Report a vulnerability** on this repository.

## How user data is protected

- Progress is stored on the device in IndexedDB. Nothing leaves the device unless the user signs in.
- Synced data lives in two Supabase tables protected by row-level security. Every policy checks `auth.uid() = user_id`; see `supabase/migrations/` and `tests/migration.test.ts`.
- The app only ever holds the Supabase **publishable** key. The secret (`service_role`) key must never be added to the repository, its variables or the app.
- Users can delete their synced data, or their whole account, from Settings.
- Your own recordings are stored on the device and, when signed in, in a private Supabase Storage bucket; policies limit each account to its own folder (`tests/migration-recitations.test.ts`). The bucket is never public.
- Reciting aloud uses the browser's speech recognition. In Chrome and Edge the audio goes to the browser maker's speech service; the app tells users this before the microphone is first used. Murajaah itself never records, uploads or stores audio.
