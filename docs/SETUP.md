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

### 1.7 Optional: let other people sign in, and use codes instead of links

Supabase's built-in email sender is meant for trying things out. It has three limits:

- **It only emails members of your Supabase organization.** Anyone else gets "Email address not authorized". You, as the owner, can sign in.
- **It sends at most 2 emails an hour.**
- **The email templates can't be edited.** The default template contains only a link, not a code.

A link is fine in a browser and on Android. On an **iPhone**, though, an app added to the Home Screen keeps its storage separate from Safari. The link opens in Safari, so it can't sign the installed app in; there you need a code.

To lift all three limits, connect your own email sender:

1. Open **Authentication → Emails → SMTP Settings** and turn on **Enable custom SMTP**. Any SMTP provider works. For personal use, Gmail is simplest:
   - **Host** `smtp.gmail.com`, **Port** `587`
   - **Username**: your Gmail address
   - **Password**: an **app password** from [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). This needs 2-Step Verification to be on; it's not your normal password.
   - **Sender email**: the same Gmail address. **Sender name**: Murajaah.

   For an app other people use, a transactional email service such as Resend or Brevo is more reliable.
2. Open **Authentication → Emails → Templates**. Edit the **Magic Link** template, and the **Confirm signup** template, which new accounts receive the first time, so each one includes the code:

   ```html
   <h2>Your Murajaah sign-in code</h2>
   <p>Enter this code in the app: <strong style="font-size: 24px; letter-spacing: 3px">{{ .Token }}</strong></p>
   <p>رمز الدخول إلى تطبيق «مراجعة»: {{ .Token }}</p>
   <p>Or open this link on the same device: <a href="{{ .ConfirmationURL }}">Sign in</a></p>
   ```

The app accepts either the code or the link, so both keep working.

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
| Sync failed: "relation public.reviews does not exist" | The SQL in 1.2 hasn't been run on this project. |
| The deploy job fails at "Configure Pages" | Pages isn't enabled with **GitHub Actions** as the source (step 2.2). |
| The app shows an old version | Reload once. The app also shows a "New version is ready" message with a Reload button. |
