# Secure build standard

*The security and reliability rules used to build Jovita (getjovita.com). Apply them to every website, web app, admin dashboard or client portal. Written for a React + Vite + Supabase + Cloudflare stack; the ideas work on any stack.*

Every rule below is something Jovita actually does. Use the checklist at the end before going live.

---

## 1. Secrets and keys

- **Never commit secrets.** `.env`, `.env.local` and `**/.env` go in `.gitignore` from day one. GitHub is not a safe place for secrets, even in a private repo.
- **Public vs secret keys.** Some keys are meant to be public and are fine in front-end code:
  - the Supabase URL and anon/publishable key
  - a Turnstile **site** key

  Everything else is secret and lives **only** in the platform's secret store:
  - the Supabase service-role key
  - Brevo/Stripe/Lemon Squeezy API keys
  - webhook secrets
  - a Turnstile **secret** key
  - database passwords

- **Secrets go only into the platform's secret store** (Supabase › Edge Functions › Secrets, Cloudflare › Worker › Settings › Variables and secrets, GitHub › Settings › Secrets). The owner pastes them there. Never paste a secret into a chat, an email, a ticket or a config file.
- **If a secret leaks, rotate it** (make a new one and delete the old one). Deleting the commit isn't enough, because git history and forks keep it.
- The service-role key is only ever used server-side (edge functions, workers). It must never reach the browser.

## 2. Database access (Supabase / Postgres)

- **Row Level Security on every table**, with no exceptions. Each row carries an owner (`studio_id`), and the policy is "you only see rows where `studio_id = my_studio_id()`".
- **Public pages never read tables directly.** Client-facing pages (gallery, invoice, quote, portal) call a single `security definer` function that:
  - takes an unguessable token (`uuid` from `gen_random_uuid()`), never a sequential ID
  - checks the password or PIN *inside the function* when there is one
  - returns only the fields that page needs (no internal notes, no other clients)
  - returns nothing if the account is suspended or the item is a draft
- Every `security definer` function sets `set search_path = ''` and uses fully qualified names (`public.invoices`).
- After creating a function, lock it down: `revoke all ... from public;` then `grant execute ... to anon, authenticated;` only if the public page needs it.
- **Storage buckets are private by default.** Only things meant to be public (logos, web-size gallery previews) go in a public bucket. Originals are delivered through a signed or proxied download.
- Write every SQL change as a numbered file (`RUN-UPDATE-28.sql`) that is **safe to run twice** (`if not exists`, `create or replace`, `drop policy if exists`). Check it afterwards with read-only queries.
- Run the platform's security advisor (Supabase › Advisors) after every schema change and fix any warnings.

## 3. Sign-in protection

- **Human check (CAPTCHA)** with Cloudflare Turnstile on sign-in, sign-up, password reset and the admin login. Pass the token to the auth call (`captchaToken`). Turn it on server-side by putting the secret key in Supabase › Authentication › Attack Protection.
  - Show the widget only on the live domain, so local testing still works.
  - Every app that signs in (web *and* phone) needs the widget **before** server-side CAPTCHA is switched on, or that app gets locked out.
- **Account lockout:** after 5 wrong passwords, pause sign-in on that device for 15 minutes. Warn when 2 or fewer tries are left. Clear the count on success.
- **IP rate limiting:** keep the platform's auth rate limits on (Supabase › Authentication › Rate Limits). Add a Cloudflare rate-limit rule on login and reset URLs when traffic grows.
- **Passwords:** a minimum of 10 characters with letters and numbers, and leaked-password protection turned on.
- Don't reveal whether an email is registered ("If that email has an account, we sent a link").
- **The admin (HQ) is a separate login** with its own human check, and only named admin accounts can open it. It shows account-level data, never customers' clients or money.

> **What's rate limiting?** It caps how many times one person or IP address can try something per minute. A bot guessing passwords gets slowed to a crawl, while a real person never notices.

## 4. Edge functions, workers and webhooks

- **Every function checks who is calling.** Read the `Authorization` header, confirm the user with `/auth/v1/user`, then act only on that user's own data.
- **Every incoming webhook verifies its signature** (an HMAC with the shared secret) before doing anything: Lemon Squeezy, Stripe, Google, inbound email. Reject unsigned calls.
- **Escape everything you put into HTML emails or pages** (`esc()` on names, messages and notes) so a client's name can't inject code.
- **Limit costly actions per account:** AI questions per plan, emails per hour, uploads by storage quota. Show a friendly message when a limit is reached.
- Never trust prices, plans or amounts sent from the browser. Re-read them on the server.

## 5. HTTP security headers

Put these on **every** response. On Cloudflare Workers static assets, add them to `public/_headers`; responses that come from worker code need them added in the code too.

```
/*
  X-Robots-Tag: noindex, nofollow                 # app only (see section 6)
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Permissions-Policy: camera=(), microphone=(self), geolocation=(), payment=(self), usb=(), interest-cohort=()
  Content-Security-Policy: frame-ancestors 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests
  Cross-Origin-Opener-Policy: same-origin-allow-popups
```

- **Hide what the server runs:** no `X-Powered-By`, and no version numbers in `Server` headers or error pages. Cloudflare shows only "cloudflare". Check with `curl -I https://yoursite`.
- Error messages shown to users never include stack traces, SQL or internal IDs.

## 6. Keep private pages out of Google

- The **app** (dashboard, client galleries, invoices, portals, admin) sends `X-Robots-Tag: noindex, nofollow` on everything.
- Pages that *should* be found (for example a public showcase like `/spotlight`) remove that header: `! X-Robots-Tag`.
- The **marketing site** has a `robots.txt` that disallows internal folders, plus a `sitemap.xml` listing only the public pages (home, about, help, privacy, showcase).
- Prefer the header over a `<meta name="robots">` tag in `index.html`. In a single-page app, the meta tag would hide every route, including the public ones.
- `noindex` is not security. Private pages still need a token or password, because noindex only keeps them off search results.

## 7. Private links and client pages

- Every shareable link uses a long random token: `/g/<token>` for galleries, `/i/<view_token>` for invoices. Never use `/invoice/1002`.
- Optional extra locks: a gallery password, and a separate download PIN.
- Before downloading, visitors on an open link give their email, so the owner can see who took what.
- Log views and downloads (who, when and what) and show them to the owner only.
- Links work under the business's own name (a subdomain like `studio.getjovita.com`, or their own domain via Cloudflare for SaaS) with HTTPS issued automatically.

## 8. Backups (in case the database company has a problem)

- The platform's own backups are not enough on their own. Keep an **independent copy**.
- **Nightly GitHub Action:**
  1. Run `pg_dump` with the matching Postgres version, covering the `public`, `auth` and `storage` schemas.
  2. Encrypt the dump with `gpg --symmetric --cipher-algo AES256` using a passphrase kept in GitHub Secrets.
  3. Upload it to a separate storage provider (Cloudflare R2 bucket), using a token that can access **only that bucket**.
- **Retention:** keep 30 daily copies, plus the 1st of each month for a year.
- Write down how to download, decrypt and restore (`docs/BACKUPS.md`), and **test a restore** at least once.
- Store the passphrase somewhere safe offline. Without it, the backups can't be opened.

## 9. Safe actions in the product

- **Every delete or cancel asks for confirmation** first, naming what will be lost.
- Anything that sends or charges shows a preview and waits for a tap. Nothing is sent automatically.
- Autosave, and ask "save or leave?" when leaving a page with unsaved changes.
- Unknown incoming emails don't become clients automatically. They wait in an inbox until a person adds them, which keeps spam out of the client list.

## 10. Fraud and identity (KYC)

- Decide **who** is verified: the businesses using the platform (usually) or their customers.
- Collect only what you need: legal name, phone, address, country, and a government ID only if required. Store ID images in a private bucket, and let the admin approve them.
- Gate the risky steps (taking payments, payouts, high limits) behind verification.
- Personal data laws apply (Nigeria NDPA, UK GDPR, EU GDPR). Say what you collect in the Privacy page, keep it only as long as needed, and share it with a government agency **only** when it comes with a valid legal request.

## 11. Working rules for whoever builds it

- Never type passwords or keys for the owner, and never ask for them in chat.
- Ask before sending any email or message, publishing a template, or deleting anything in Cloudflare, Supabase or GitHub.
- Never delete files on the owner's computer. Move them to `_to_delete/` instead.
- Before pushing: build, test the changed screens, and check them at desktop and phone width. Push to GitHub, which deploys automatically. Then **check the live site** (headers, the new feature, and that nothing else broke).
- When asked to change one thing ("don't touch anything else"), change only that.

---

## Go-live checklist

| ✔ | Check |
|---|---|
| ☐ | No secrets in the repo; `.env` is in `.gitignore` |
| ☐ | RLS is on for every table; the advisor shows no warnings |
| ☐ | Public pages use tokens and `security definer` functions only |
| ☐ | Storage buckets are private unless they're meant to be public |
| ☐ | Turnstile is on all sign-in forms (web and phone) and the secret key is set in auth |
| ☐ | Lockout after 5 tries; auth rate limits on; minimum password 10; leaked-password check on |
| ☐ | Every function checks the user; every webhook checks its signature |
| ☐ | Security headers are live (`curl -I`); no `X-Powered-By` |
| ☐ | The app is noindex; the public pages and sitemap are indexable |
| ☐ | The nightly encrypted backup ran, and a test restore worked |
| ☐ | Deletes and cancels ask for confirmation; sends show a preview |
| ☐ | The Privacy page covers the data collected (and KYC, if used) |
