# Connecting email and Google Calendar

Two parts: a one-time setup that only you (the Jovita owner) do, and then what every creative does in the app. WhatsApp comes in v2.

## Part 1 · One-time setup (you, once)

### Email (Brevo)
Already done: hello@getjovita.com is the sender, and the templates are in Brevo.

1. Brevo › **SMTP & API** › **API keys** › Generate a new key (name it "Jovita send-email").
2. Supabase › **Edge Functions** › **Secrets** › add `BREVO_API_KEY` with that key. Never paste it anywhere else.
3. Brevo › **Templates**: make sure every template you want to use is **Active** (including **Client · Quote** #14 and **Jovita · Quote accepted** #15).

Test: in the app, send an invoice to a client whose email is your own.

### Client emails in the Jovita Inbox (free, once)
This makes client replies land in Inbox like a chat. Every studio gets its own address: `inbox+<code>@getjovita.com`.

1. **Make a secret:** any long random password (e.g. from a password manager). Keep it handy for steps 3 and 4.
2. **Cloudflare › Workers & Pages › Create › Import a repository** › `topeadenola/jovita`.
   Project name `jovita-mail`, root directory `workers/mail`, build command empty, deploy command `npx wrangler deploy`.
3. In the new **jovita-mail** Worker › Settings › Variables and secrets › add a **Secret** called `INBOUND_SECRET` with your secret.
4. **Supabase › Edge Functions › Secrets:** add `INBOUND_SECRET` (same value) and `INBOX_DOMAIN` = `getjovita.com`.
5. **Cloudflare › getjovita.com › Email › Email Routing › Settings:** turn on **Subaddressing**.
6. **Email Routing › Routing rules › Create address:** custom address `inbox` › action **Send to a Worker** › `jovita-mail`.

Test: send an email to the inbox address shown in Settings › Connections. It appears in Inbox within a few seconds.
Until steps 4 to 6 are done, client replies simply go to the creative's own email, so nothing breaks.

### Google Calendar (so creatives can press "Connect Google Calendar")
1. Go to console.cloud.google.com › create a project called **Jovita**.
2. **APIs & Services › Library** › enable **Google Calendar API**.
3. **OAuth consent screen**: External, app name Jovita, support email hello@getjovita.com, logo, home page https://getjovita.com, privacy policy https://getjovita.com/privacy/. Add the scopes `.../auth/calendar.events`, `userinfo.email`, `openid`.
4. **Credentials › Create credentials › OAuth client ID** › Web application.
   Authorised redirect URI: `https://bdyjlmgjtrzqmohkklcg.supabase.co/functions/v1/google-calendar`
5. Supabase › Edge Functions › Secrets: add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
6. While the Google app is in **Testing**, add your test users' emails. To open it to everyone, press **Publish app** and complete Google's verification (calendar is a "sensitive" scope; Google reviews it, usually in a few days).

## Part 2 · What each creative does (in the app)

### Email: nothing to set up (Inbox address shown in Settings › Connections)
1. **Settings › Connections › Email**.
2. **Client replies go to**: leave as their sign-in email, or type their studio email.
3. **Send me a copy**: on if they want a copy of every client email.

Client emails arrive as "Their Studio via Jovita" with their logo. When the client replies, it goes straight to the creative's own inbox.

### Google Calendar: one click
**Settings › Connections** (or **Bookings**) › **Connect Google Calendar** › sign in › Allow.

The help centre page for creatives is at https://getjovita.com/help/#connect-email.
