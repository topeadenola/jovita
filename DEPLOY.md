# Putting Jovita online

Two Cloudflare Pages projects, both built from this GitHub repo. Every push to `main` updates them automatically.

| Project | Address | Root directory | Build command | Output directory |
|---|---|---|---|---|
| `jovita-site` | getjovita.com, www.getjovita.com | `public/landing` | *(leave empty)* | `.` |
| `jovita-app` | app.getjovita.com | *(leave empty)* | `npm run build` | `dist` |

`jovita-app` needs two environment variables (Settings › Variables and secrets). Both are public by design:

- `VITE_SUPABASE_URL` = `https://bdyjlmgjtrzqmohkklcg.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_e4uUY4mdZWUP9g88VubPzQ_rdIbv8RC`

Optional: set `NODE_VERSION` = `20`.

`public/_redirects` sends app links such as `/p/<token>`, `/g/<token>` and `/admin/` to the right page.

## After the first deploy

1. Each project › **Custom domains** › add the addresses in the table. Cloudflare adds the DNS records itself.
2. Supabase › Authentication › URL Configuration: Site URL `https://app.getjovita.com`, and add `https://app.getjovita.com/**` to Redirect URLs.
3. Supabase › Edge Functions › Secrets: `APP_URL` = `https://app.getjovita.com` (optional; it is already the default).

Never put secret keys (Brevo, Anthropic, payment secret keys) in Cloudflare or in this repo. They live only in Supabase secrets.
