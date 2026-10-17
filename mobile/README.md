# Jovita for iOS and Android

The Jovita phone app, built with Expo (React Native). It uses the same Supabase project as the web app, so your clients, projects, invoices and templates are the same everywhere.

## Try it on your phone (5 minutes)

1. Install **Expo Go** from the App Store or Google Play.
2. On your Mac:

```bash
cd ~/Documents/jovita/mobile
npm install
npx expo start
```

3. Scan the QR code in Terminal with your phone's camera (iPhone) or the Expo Go app (Android). Your phone and Mac need to be on the same Wi-Fi.

Sign in with the same email and password you use on the web app.

## What's in it

| Tab | What you can do |
| --- | --- |
| Today | Money at a glance, what needs you, upcoming sessions. Load example data on a new studio |
| Projects | Pipeline by stage, next-step button, progress, move stages, invoices, share the client portal link with your phone's share sheet (WhatsApp, SMS, email) |
| Clients | Search, add, edit. Call, WhatsApp or email a client in one tap |
| Money | Totals in ₦/£/$, invoice list, send, nudge (shares a payment link), mark paid, reminders switch |
| More | Inbox (reply to portal messages), Bookings, Galleries (deliver, extend), Templates (edit contracts, model releases, invoice packages and emails with merge fields), Settings, Sign out |

Client portal links point at `EXPO_PUBLIC_WEB_URL` in `.env` (your Netlify site). They work once the web app is deployed.

## Settings

`.env` holds the Supabase project and the web address. It is git-ignored. `.env.example` shows the keys.

## Publishing to the App Store and Google Play (later)

When you're ready, Expo's EAS service builds and submits the apps for you without Xcode or Android Studio:

```bash
npx eas-cli@latest build --platform all
npx eas-cli@latest submit
```

You'll need an Apple Developer account and a Google Play Console account. The app IDs are set to `app.jovita.mobile` in `app.json`; change them before the first build if you prefer another.
