# Jovita backups

**What:** every night at 03:17 (Lagos) GitHub backs up the database (Jovita's data, sign-in accounts and file records),
encrypts it with your passphrase, and saves it in the private Cloudflare R2 bucket **jovita-backups**.
Photos are separate: they already live in R2 (bucket jovita-media).

**Kept:** the last 30 nights, plus the 1st of every month for a year.

## Get a copy onto your laptop
1. Cloudflare › R2 › **jovita-backups** › `db/` › pick a year and month › click the file › **Download**.
2. Open Terminal in the folder where it downloaded and run (it asks for your backup passphrase):
   ```
   gpg --decrypt jovita-2026-11-01.dump.gpg > jovita-2026-11-01.dump
   ```
   (Install gpg once with `brew install gnupg` if needed.)

Keep the `.gpg` file. It's useless to anyone without the passphrase.

## Restore (only if the live database is lost)
Into a fresh Supabase project (or any Postgres 17):
```
pg_restore --no-owner --no-privileges --dbname "<new database connection string>" jovita-2026-11-01.dump
```
Then point the app at the new project (VITE_SUPABASE_URL / key) and redeploy the edge functions.
Practise this once every few months on a spare project, so you know it works.

## If a backup fails
GitHub emails you when the "Database backup" action fails. Open GitHub › Actions › Database backup to see why
(usually an expired R2 key or a changed database password: update the secret and press **Run workflow**).
