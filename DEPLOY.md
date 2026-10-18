# Putting Jovita online

Three Cloudflare Workers (static assets), both built from this GitHub repo. Every push to `main` updates them automatically.

| Project | Address | Root directory | Build command | Output directory |
|---|---|---|---|---|
| `jovita` | getjovita.com, www.getjovita.com | `public/landing` | *(leave empty)* | uses `public/landing/wrangler.jsonc` |
| `jovita-app` | app.getjovita.com | *(leave empty)* | `npm run build` (or empty: wrangler.jsonc builds it) | uses `wrangler.jsonc` (dist/) |
| `jovita-mail` | (no address: receives email from Email Routing) | `workers/mail` | *(leave empty)* | uses `workers/mail/wrangler.jsonc` |

Deploy command for both: `npx wrangler deploy`.

The app needs two environment variables (Settings › Build › Variables and secrets, so they exist while building). Both are public by design:

- `VITE_SUPABASE_URL` = `https://bdyjlmgjtrzqmohkklcg.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_e4uUY4mdZWUP9g88VubPzQ_rdIbv8RC`

Optional: set `NODE_VERSION` = `20`.

`wrangler.jsonc` sends app links such as `/p/<token>` and `/g/<token>` to the app (single-page mode).

## After the first deploy

1. Each project › **Custom domains** › add the addresses in the table. Cloudflare adds the DNS records itself.
2. Supabase › Authentication › URL Configuration: Site URL `https://app.getjovita.com`, and add `https://app.getjovita.com/**` to Redirect URLs.
3. Supabase › Edge Functions › Secrets: `APP_URL` = `https://app.getjovita.com` (optional; it is already the default).

Never put secret keys (Brevo, Anthropic, payment secret keys) in Cloudflare or in this repo. They live only in Supabase secrets.

## Client emails into the Inbox (jovita-mail)

See `docs/CONNECT-EMAIL-AND-CALENDAR.md` › "Client emails in the Jovita Inbox". In short: deploy `jovita-mail`, give it the secret `INBOUND_SECRET`,
add the same `INBOUND_SECRET` plus `INBOX_DOMAIN=getjovita.com` in Supabase secrets, turn on Subaddressing in Email Routing, and route `inbox@getjovita.com` to the Worker.
