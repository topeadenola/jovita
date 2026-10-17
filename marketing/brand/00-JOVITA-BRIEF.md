# Jovita — project brief

**Run your creative business with joy.**

Jovita is a CRM / studio manager for photographers and other creatives — a friendlier, easier alternative to Pixieset. This Project is the main home for building it.

## Who it's for
- **Version 1 launch:** photographers, videographers, makeup artists, content creators
- **Later versions:** designers, stylists and other creatives
- **Markets:** Africa, United Kingdom, USA

## Plan order
1. Company name, logo and brand guidelines ✅ (name: Jovita · logo: "Smile" direction · guidelines v1.0 done)
2. Business setup, Ask Jovita icon, 15-page brand guidelines v2 (bold pages + merch) ← now
3. Full product design in Figma (web + mobile), review
4. Build the web app and test
5. Marketing materials
6. Version 2: phone app

## Brand decisions
- Logo: **"Smile"** — lowercase j as a winking face (two dots = eyes, the hook = a marigold smile), lowercase "jovita" wordmark in Bricolage Grotesque ExtraBold
- Palette: **Marigold #FFB320** (joy) and **Plum #261433** (trust), with Lilac #E9DDFB and Paper #FBF8FF
- Type: Bricolage Grotesque (display) + Figtree (text)
- Look: **bright colours** with a **bright/dark mode switch**. In bright mode the left sidebar is white too; only the boxes/cards carry colour
- **Ask Jovita icon: "Typing to Smile"** (option 2) — marigold speech bubble; typing dots bounce while Jovita works, then turn into the plum smile face and wink. Plays once on open, hover and task done; never loops
- **Brand guidelines v2.0:** 24 pages incl. bold pages, taglines, the "Jovita's got you" pitch, icons and motion, photography shot list, what clients see, social templates, bright/dark modes, Ask Jovita + Train your Jovita, web and phone app screens, and merch (tee, cap, tote, mug, stickers, business card)
- Full details: `design-system/README.md`, `design-system/tokens.json`, `brand-guidelines.md`

## Tech stack
- Built **locally on the laptop** (not Lovable), pushed to **GitHub**
- **Supabase** backend, hosted on **Netlify**
- **Phone app (iOS + Android)** kept in the same local project folder — **launches in version 2**
- Screens (web + mobile) are **designed here by Claude first**, reviewed, then Tope moves them into Figma manually (Figma Starter plan's MCP limit of 20 calls/month blocks building directly). Built on the existing Jovita designs (modified, not restarted)
- Domain shortlist (available on Hostinger, 13 Oct 2026): jovita.studio, jovita.me, jovita.pro, jovita.live, jovita.online, jovita.life — not bought yet

## Features wanted
- Main sections: Today, Clients, Projects, Bookings, Money, Galleries, Settings
- Project stages: Inquiry → Booked → Shooting → Editing → Delivered → Done
- Invoice states: Draft, Sent, Due soon, Overdue, Paid, Cancelled
- Editable **invoice, contract and model release templates**
- **Accounting page:** income plus spending on subscriptions (e.g. Evoto, Adobe)
- **Two-way Google Calendar sync**
- **Import old clients** from CSV / spreadsheets
- Plans include **deliverable storage per package**
- **Payment reminders ON by default**, with a switch to turn them off (per invoice and in settings)
- **Onboarding asks the creative's career** (photographer, videographer, makeup artist, content creator) and sets up tailored package templates, invoice templates, contracts and releases for that career
- Payments: Paystack, Flutterwave, Stripe, bank transfer; currencies ₦ £ $ (plus CFA franc and euro)

## Positioning
- Sales line: **"No PA. No operations manager. Jovita's got you."** A solo creative gets the help of a PA and an operations manager without hiring one (chases payments, sends contracts, books shoots, delivers galleries, drafts replies, keeps the books)

## Marketing website
- The home page must lead with what makes Jovita different: one app for galleries + studio, local payments (Paystack, naira), Ask Jovita, onboarding tailored by career, reminders on by default, accounting page, multi-language

## Ask Jovita (AI assistant)
- Built into each creative's dashboard; acts **only when prompted** (e.g. create a task, tell me my balance)
- **Paid plans only** — not on the free plan
- **For creatives only** — not in the client portal
- Pinned **bottom-right, on the dashboard only**
- Confirms before sending anything or touching money; only sees that studio's own data
- **Train your Jovita:** a place (in Settings, paid plans) where owners teach Jovita their tone and style from past emails, captions and brand words, with tone controls (warm/formal, short/detailed)
- **Later version:** Jovita handles marketing — newsletters, offers and follow-ups written in the owner's trained voice and sent on schedule

## Motion and sound
- Storyboards for: YouTube brand film "Meet Jovita" (~1:47), website hero loop (20s), and three Reels/TikTok formats ("Still chasing?", "I asked my app…", "POV: it runs itself")
- Film includes scenes for: one inbox (WhatsApp, email, website chat → quote → deposit paid), made for each career (Tope's career icons), and speaks your language (EN, FR, SW, PT, ES)
- Every on-screen element gets a sound effect; Jovita has its **own sounds** (made from scratch), incl. a sonic logo "Jovita smile"
- Voice-over via **ElevenLabs** (voice still to choose); footage scenes generated in **Higgsfield**, possibly featuring Tope

## Localisation
- Localised by location (e.g. French in Abidjan, Spanish in Spain)
- Languages: **French, Spanish, Portuguese, Swahili** (plus English)
- A **French version of the design** for marketing

## Files in this Project
| File | What it is |
| --- | --- |
| `00-JOVITA-BRIEF.md` | This overview |
| `brand-guidelines.md` | Text of the Brand Guidelines deck (v1.0, Oct 2026) |
| `design-system/README.md` | Design system: voice, logo rules, colour, type, layout, vocabulary |
| `design-system/tokens.json` | All design tokens (colours, type scale, spacing, radius, shadows) |
| `design-system/components/*` | Button, StatusPill, ProjectCard, TextField specs + `bundle.css` |
| `logo/concept-a-smile-chosen.html` | The chosen logo direction (inline SVG mark) |
| `logo/concept-b-viewfinder.html`, `logo/concept-c-conversation.html` | The two directions not chosen, for reference |
| `logo/logo-files.md` | List of the final SVG logo files |
| `prototypes/jovita-web-app.html` | Full clickable web-app prototype (React build) |
| `prototypes/jovita-app-screens.html` | App screens prototype (sidebar, Today, Clients, Projects board, Money, Inbox…) |

## Original artifacts (still live)
- Jovita web app prototype — https://claude.ai/code/artifact/3dce46aa-7cc7-480a-9945-eb28f452c2a6
- Jovita App screens — https://claude.ai/code/artifact/357ca4e0-b856-4d7d-a96e-63d64f4a68fa
- Jovita Brand Guidelines (slides) — https://claude.ai/code/artifact/8c45870a-2eb4-4482-b219-069c9c8307b0
- Jovita Design System (holds the logo SVGs + fonts) — https://claude.ai/code/artifact/9e11297b-a28c-46d4-95c3-beb21fcc95dc
- Jovita Logo Concepts — https://claude.ai/code/artifact/5549ac5b-6153-4b48-bb2d-8103dd233e70
