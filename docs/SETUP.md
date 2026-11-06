# Setting up accounts, sync and hosting

Murajaah works on its own with no setup: progress is stored on each device. This guide adds two optional things:

1. **Accounts and sync** through Supabase, so progress follows you across devices.
2. **Hosting on GitHub Pages**, so the app has a public address you can open and install on your phone.

The app is still fully usable while you do these. You can also do only the second part and skip sync.

---

## 1. Turn on accounts and sync (Supabase)

### 1.1 Create the project

If you haven't already, create a project at [supabase.com](https://supabase.com) (the free plan is enough). Any region works; choose one near you.

You don't need Supabase's **GitHub integration** for this app. If you turned it on, you can leave **Deploy to production** off. The database is set up by running one SQL script in the next step.

### 1.2 Create the tables

1. In the Supabase dashboard, open **SQL Editor** → **New query**.
2. Open [`supabase/migrations/20261106000000_init.sql`](../supabase/migrations/20261106000000_init.sql) and paste **its contents**, everything in the file, not its name.
3. Select **Run**. You should see "Success. No rows returned".

This creates two tables, `reviews` and `user_settings`, and locks both with row-level security so each account can only read and change its own rows. It also adds a function that lets a signed-in user delete their own account. Running the script again is harmless.

4. Open a new query and do the same with [`supabase/migrations/20261106020000_recitations.sql`](../supabase/migrations/20261106020000_recitations.sql). It adds the table for whole-surah recitations (so the three clean days count across your devices) and a **private** storage bucket, `recitations`, for your own recordings. Each account can only reach files in its own folder; nothing in the bucket is public.

   The free plan includes 1 GB of storage. Recordings are compressed: about 15 MB per hour of recitation.

5. Open a new query and do the same with [`supabase/migrations/20261107000000_more_modes.sql`](../supabase/migrations/20261107000000_more_modes.sql). It lets the newer practice modes (where on the page, from the meaning, and similar ayahs) sync. Until it's run, their answers stay on the device they were given on, and Settings says so.
6. Optional, for the daily reminder: [`supabase/migrations/20261108000000_reminders.sql`](../supabase/migrations/20261108000000_reminders.sql). It needs two secrets first, so follow [1.8](#18-optional-daily-reminders) for this one.

### 1.3 Tell Supabase where the app lives

Sign-in emails contain a link that brings you back to the app, and Supabase only sends people back to addresses you allow.

1. Open **Authentication** → **URL Configuration**.
2. Set **Site URL** to your GitHub Pages address, e.g. `https://noorul-ayn.github.io/murajaah-revision-/`.
3. Under **Redirect URLs**, select **Add URL** and add the same address followed by `**`, e.g. `https://noorul-ayn.github.io/murajaah-revision-/**`. For local development, also add `http://localhost:5173/**`.
4. Save.

Open the sign-in link **on the same device and in the same browser** where you asked for it. The link only works there, which stops someone who intercepts the email from using it.

### 1.4 Copy the two public values

Open **Project Settings**:

- **Data API** (or **API**): copy the **Project URL**, e.g. `https://ivtvtpukvzszrnauwvgu.supabase.co`.
- **API Keys**: copy the **publishable key** (`sb_publishable_…`). On older projects it's called the **anon public** key.

Both values are meant to be public; they end up in the app that runs in the browser. **Never use the secret or `service_role` key in the app, in GitHub or in chat.** Anyone holding that key can read and change every user's data.

### 1.5 Give the values to the app

**For the hosted app**, in your GitHub repository go to **Settings → Secrets and variables → Actions → Variables** and add two repository variables:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | your Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | your publishable key |

They're added as *variables*, not secrets, because they're public. The next deploy picks them up. To deploy straight away, open **Actions → CI and deploy → Run workflow**.

**For local development**, copy `.env.example` to `.env.local` and fill in the same two values. `.env.local` is ignored by git.

### 1.6 Try it

Open the app and go to **Settings → Account and sync**. Enter your email and select **Email me a sign-in link**, then open the link in the email. The app opens on Settings and shows you signed in. Progress syncs a few seconds after each answer, when the app comes back to the foreground, and when the connection returns.

### 1.7 Let other people sign in, and use codes instead of links

Supabase's built-in email sender is only for trying things out:

- **It only emails members of your Supabase organization.** Anyone else gets "Email address not authorized". You, as the owner, can sign in.
- **It sends at most 2 emails an hour.**
- **The email templates can't be edited.** The default email contains only a link, not a code.

A link is fine in a browser and on Android. On an **iPhone**, an app added to the Home Screen keeps its storage separate from Safari: the link opens in Safari and can't sign the installed app in. There you need a code.

To lift all three limits, send the emails from your own Gmail address (free, up to 500 emails a day):

1. **Make a Gmail app password.** Open [myaccount.google.com/security](https://myaccount.google.com/security) and make sure **2-Step Verification** is on. Then open [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), type a name (Murajaah) and select **Create**. Copy the 16-letter password it shows, without the spaces. It's not your Gmail password, and Google removes it if you ever change your Gmail password; make a new one then.
2. **Connect it to Supabase.** Open **Authentication → Emails → SMTP Settings** and turn on **Enable custom SMTP**:
   - **Sender email**: your Gmail address. **Sender name**: Murajaah.
   - **Host** `smtp.gmail.com`, **Port** `465`.
   - **Username**: your Gmail address. **Password**: the app password.

   Select **Save**. If sending fails, try port `587`.
3. **Allow more emails an hour.** Open **Authentication → Rate Limits** and set **Rate limit for sending emails** to 30 or more.
4. **Put the code in the email.** Open **Authentication → Emails → Templates**. Edit the **Magic Link** template, and the **Confirm signup** template, which new accounts receive the first time, so each one includes the code:

   ```html
   <h2>Your Murajaah sign-in code</h2>
   <p>Enter this code in the app: <strong style="font-size: 24px; letter-spacing: 3px">{{ .Token }}</strong></p>
   <p>رمز الدخول إلى تطبيق «مراجعة»: {{ .Token }}</p>
   <p>Or open this link on the same device: <a href="{{ .ConfirmationURL }}">Sign in</a></p>
   ```

5. **Try it** with an email address outside your Supabase organization: a family member's, or a second address of yours.

The app accepts either the code or the link, so both keep working. If the app grows beyond family and friends, a transactional email service (Resend, Brevo, Postmark) with your own domain delivers more reliably than Gmail.

### 1.8 Optional: daily reminders

The daily reminder sends one notification at the time each person chooses, saying how many questions are due. It needs accounts (above), and takes about 15 minutes to set up once:

1. **Make the keys.** Open your published app at `…/#/setup/reminders` (for example `https://noorul-ayn.github.io/murajaah-revision-/#/setup/reminders`) and select **Make the keys**. Keep the tab open; you'll copy three values from it. They are made in your browser and sent nowhere.
2. **Store two secrets in the database.** In **SQL Editor → New query**, run this, with your project URL (the same value as `VITE_SUPABASE_URL`) and the **REMINDER_SECRET** from step 1:

   ```sql
   select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'murajaah_project_url');
   select vault.create_secret('PASTE-REMINDER_SECRET-HERE', 'murajaah_reminder_secret');
   ```

3. **Run the reminders SQL.** In a new query, paste the contents of [`supabase/migrations/20261108000000_reminders.sql`](../supabase/migrations/20261108000000_reminders.sql) and run it. It adds the `reminders` table and a job that runs every 15 minutes. If it says an extension isn't available, open **Database → Extensions**, turn on **pg_cron** and **pg_net**, and run it again.
4. **Add the reminder function.** Open **Edge Functions → Deploy a new function → Via Editor**. Name it `daily-reminder`, replace the example code with the contents of [`supabase/functions/daily-reminder/index.ts`](../supabase/functions/daily-reminder/index.ts), and deploy. Then open the function's **Details** and turn off **Enforce JWT verification** (the database proves itself with the reminder secret instead), and save.
5. **Give the function its secrets.** Open **Edge Functions → Secrets** and add four:
   - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: from step 1.
   - `REMINDER_SECRET`: from step 1, the same one as in step 2.
   - `VAPID_SUBJECT`: `mailto:` followed by your email address, so push services can contact you.
6. **Give the app the public key.** On GitHub, open **Settings → Secrets and variables → Actions → Variables** and add `VITE_VAPID_PUBLIC_KEY` with the public key from step 1. Then run the workflow again (**Actions → CI and deploy → Run workflow**).
7. **Try it.** Open the app, sign in, and in **Settings → Daily reminder** turn it on with a time a few minutes from now. The notification arrives within 15 minutes of that time (the job runs every quarter hour). On iPhone and iPad, add the app to the Home Screen first and open it from there.

Keep the private key and the reminder secret to yourself. If you ever make new keys, everyone has to turn their reminder off and on again.

---

## 2. Publish on GitHub Pages

1. Push the code to the `main` branch of your repository.
2. In the repository, open **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab. The **CI and deploy** workflow runs the tests, builds the app and publishes it. If it ran before Pages was enabled, select **Run workflow** to run it again.

The app will be at `https://<owner>.github.io/<repository>/`. For this repository that's `https://noorul-ayn.github.io/murajaah-revision-/`.

On a phone, open that address and choose **Add to Home Screen** (Safari) or **Install app** (Chrome) to install it.

---

## Troubleshooting

| What you see | What to do |
| --- | --- |
| No **Account and sync** section in Settings | The build has no Supabase values. Check the two repository variables (1.5) and run the workflow again. |
| The link opens Supabase's site or the wrong address | Set **Site URL** and **Redirect URLs** (1.3). |
| "That sign-in link didn't work here" | The link was opened in a different browser or device from the one that asked for it. Ask again from the browser you'll open the email in, or set up codes (1.7). |
| "Email address not authorized" | The built-in sender only emails your Supabase organization's members. Set up custom SMTP (1.7). |
| "Email rate limit exceeded" | The built-in sender allows 2 emails an hour. Wait, or set up custom SMTP (1.7). |
| syntax error at or near "supabase" in the SQL Editor | The file's name was pasted instead of its contents (1.2). |
| Recordings stay "on this device" and never reach the account | The recitations SQL (1.2, step 4) hasn't been run on this project. |
| Settings says answers from the newer practice modes are kept on this device | The SQL in 1.2, step 5 hasn't been run on this project. |
| No **Daily reminder** section in Settings | The build has no `VITE_VAPID_PUBLIC_KEY` (1.8, step 6), or this browser can't receive notifications. |
| "The reminder couldn't be saved" | The reminders SQL (1.8, step 3) hasn't been run. |
| The reminder is on but no notification comes | Check the job ran (**Integrations → Cron → Jobs**, `murajaah-reminders`) and the function's **Logs**. A 403 there means the two copies of the reminder secret (1.8, steps 2 and 5) differ. Nothing is sent on a day with nothing due. |
| Sync failed: "relation public.reviews does not exist" | The SQL in 1.2 hasn't been run on this project. |
| The deploy job fails at "Configure Pages" | Pages isn't enabled with **GitHub Actions** as the source (step 2.2). |
| The app shows an old version | Reload once. The app also shows a "New version is ready" message with a Reload button. |
