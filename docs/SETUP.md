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
2. Paste the whole of [`supabase/migrations/20261106000000_init.sql`](../supabase/migrations/20261106000000_init.sql).
3. Select **Run**. You should see "Success. No rows returned".

This creates two tables, `reviews` and `user_settings`, and locks both with row-level security so each account can only read and change its own rows. It also adds a function that lets a signed-in user delete their own account. Running the script again is harmless.

### 1.3 Send sign-in codes instead of links

The app signs people in with a 6-digit code they type in. It doesn't use a link they click, because links often open in a different browser from the installed app. Supabase sends links by default, so change two email templates:

1. Open **Authentication** → **Emails** (or **Email Templates**).
2. Open the **Magic Link** template and replace its body with:

   ```html
   <h2>Your Murajaah sign-in code</h2>
   <p>Enter this code in the app:</p>
   <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px">{{ .Token }}</p>
   <p>رمز الدخول إلى تطبيق «مراجعة»: {{ .Token }}</p>
   ```

3. Do the same for the **Confirm signup** template, which new accounts receive the first time.
4. Save both.

> Supabase's built-in email service only sends a few emails per hour. That's fine for personal use. For more users, add your own SMTP provider under **Authentication → SMTP Settings**.

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

Open the app and go to **Settings → Account and sync**. Enter your email, type the code you receive, and you're signed in. Progress syncs a few seconds after each answer, when the app comes back to the foreground, and when the connection returns.

---

## 2. Publish on GitHub Pages

1. Push the code to the `main` branch of your repository.
2. In the repository, open **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab. The **CI and deploy** workflow runs the tests, builds the app and publishes it. If it ran before Pages was enabled, select **Run workflow** to run it again.

The app will be at `https://<owner>.github.io/<repository>/`. For this repository that's `https://noorul-ayn.github.io/murajaah-revision-/`.

On a phone, open that address and choose **Add to Home Screen** (Safari) or **Install app** (Chrome) to install it.

### Optional: tell Supabase where the app lives

In Supabase, under **Authentication → URL Configuration**, set **Site URL** to your GitHub Pages address. Code sign-in doesn't need it, but it keeps the links in Supabase's other emails correct.

---

## Troubleshooting

| What you see | What to do |
| --- | --- |
| No **Account and sync** section in Settings | The build has no Supabase values. Check the two repository variables (1.5) and run the workflow again. |
| The email has a link but no code | The template change in 1.3 hasn't been saved, or a new account got the **Confirm signup** email. Update both templates. |
| "Email rate limit exceeded" | Supabase's built-in email limit was hit. Wait an hour, or set up SMTP. |
| Sync failed: "relation public.reviews does not exist" | The SQL in 1.2 hasn't been run on this project. |
| The deploy job fails at "Configure Pages" | Pages isn't enabled with **GitHub Actions** as the source (step 2.2). |
| The app shows an old version | Reload once. The app also shows a "New version is ready" message with a Reload button. |
