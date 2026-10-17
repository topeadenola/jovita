# Jovita

The friendly studio manager for photographers, videographers, makeup artists, stylists and designers.

Clients, projects, bookings, invoices, galleries and templates in one place, with a client portal where each client signs, pays and messages you from one link.

**Stack:** React + Vite (frontend), Supabase (database, login, security), Netlify (hosting).

---

## Run it on your Mac

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
cd ~/Documents/jovita
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173), create your studio, and click **Load example data** to explore.

The `.env` file already points at your Supabase project `jovita` (London). It's git-ignored, so it never goes to GitHub. `.env.example` shows the two values if you ever need to recreate it.

## Push to GitHub

1. Create an empty repository on github.com called `jovita`. Don't add a README.
2. In Terminal:

```bash
cd ~/Documents/jovita
git init -b main
git add .
git commit -m "Jovita v1"
git remote add origin https://github.com/YOUR-USERNAME/jovita.git
git push -u origin main
```

`.env` and `node_modules` are in `.gitignore`, so your keys and installed packages stay on your Mac.

## Host on Netlify

1. In Netlify, choose **Add new site → Import an existing project → GitHub**, and pick `jovita`.
2. The build settings come from `netlify.toml` (`npm run build`, publish `dist`).
3. Under **Site configuration → Environment variables**, add:
   - `VITE_SUPABASE_URL` = `https://bdyjlmgjtrzqmohkklcg.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the value in your `.env`
4. Deploy. Then in Supabase go to **Authentication → URL Configuration** and set **Site URL** to your Netlify address (e.g. `https://jovita.netlify.app`), so sign-up emails link back to the live site.

## What's in v1

| Area | What works |
| --- | --- |
| Today | What needs you (overdue invoices, new inquiries, unsigned contracts), money totals in ₦/£/$, upcoming sessions |
| Clients | Add, search, edit, delete; leads vs clients |
| Projects | Board and list pipeline (Inquiry → Booked → Shooting → Editing → Delivered), next-step button, progress tracker |
| Templates | Edit contracts, model releases, invoice packages (line items) and emails, with merge fields like `{client_name}` and a live preview |
| Money | Invoices with automatic numbering, statuses (Draft, Sent, Due soon, Overdue, Paid), mark paid, payment method settings |
| Bookings | Session types and upcoming sessions |
| Galleries | Create, deliver and extend galleries |
| Inbox | Messages clients send from their portal |
| Client portal | `/p/<secret-link>`: sign contract, sign model release, pay by bank transfer, message the studio |

## Coming next

- Photo uploads to galleries (Supabase Storage)
- Card payments with Paystack and Stripe (Supabase Edge Functions + webhooks)
- Sending emails and WhatsApp messages, and automatic reminders
- Public booking page with Google Calendar sync
- PDF downloads of invoices and signed contracts

## Database

The SQL that set up Supabase is in `supabase/migrations/`. Every table uses row-level security, so each studio only ever sees its own data. The client portal works through four database functions that only accept a project's secret link token.

## Landing page

Signed-out visitors see the landing page at `/`. Log in is at `/login`, sign up at `/signup`.

**Add your hero photo:** save a cut-out portrait (a PNG with a transparent background, about 1200px tall) as `public/hero.png`. It sits in the big marigold circle. Until then, the circle shows the Jovita smile.

The prices on the pricing section are placeholders in square brackets. Edit them in `src/pages/Landing.jsx`.

## Brand

Colours, type and voice follow the Jovita brand guidelines: marigold `#FFB320`, plum `#261433`, lilac, Bricolage Grotesque for headings and Figtree for text.

## Languages and currencies

Jovita speaks English, French, Spanish, Portuguese and Swahili.

- **How it picks:** a choice made in the app → the studio's saved language (Settings) → the visitor's country
  (Netlify adds a `jv_country` cookie via `netlify/edge-functions/geo.js`) → the phone/browser language → English.
  Someone opening Jovita in Abidjan sees French, in Madrid Spanish, in Dar es Salaam Swahili.
- **Client portal** follows the client's own location and language, with a switcher at the top.
- **Where the words live:** `src/locales/*.json` (web) and `mobile/src/locales/*.json` (phone, same files).
  Code uses `tx("English text")`; anything missing falls back to English.
  Have a native speaker review before launch, especially Swahili and the contract wording.
- **Currencies:** NGN, GBP, USD, EUR and XOF (West African CFA franc). Amounts and dates format for
  the language, e.g. `520 000 F CFA`, `1.250,50 €`.

## Accounting

Accounting page (web `/accounting`, phone More → Accounting): income from paid invoices, expenses by
category, profit, a 6-month chart, subscriptions (Adobe, Evoto…) with renewal reminders, and
"Export for accountant" (CSV). Tables: `expenses`, `subscriptions` (migration `20261011020000`).

## Import clients

Clients → Import from file. CSV, Excel (.xlsx/.xls) or OpenDocument. Columns are matched
automatically in English, French, Spanish, Portuguese and Swahili; duplicates (same email or phone) are skipped.

## Google Calendar two-way sync

The edge function `supabase/functions/google-calendar` is already deployed. To switch it on:

1. Google Cloud Console → create a project → enable **Google Calendar API**.
2. OAuth consent screen → External → add scopes `calendar.events` and `userinfo.email` → add yourself as a test user.
3. Credentials → Create OAuth client ID → **Web application** → Authorized redirect URI:
   `https://bdyjlmgjtrzqmohkklcg.supabase.co/functions/v1/google-calendar`
4. Supabase → Edge Functions → Secrets → add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` (your Netlify URL).
5. In Jovita → Bookings → **Connect Google Calendar**.

Bookings made in Jovita appear in Google; events made in Google show in Jovita as busy time and warn
you about clashes; moving a Jovita booking in Google moves it in Jovita. Before going public with more
than 100 users, Google needs to verify the app (calendar is a sensitive scope).

## Testing without email confirmation

Either switch off **Authentication → Sign In / Providers → Email → Confirm email** in Supabase,
or run `supabase/optional/testing_autoconfirm.sql` in the SQL editor (it also creates
`demo@jovita.app` / `JovitaDemo2026`). Drop the trigger before launch.
