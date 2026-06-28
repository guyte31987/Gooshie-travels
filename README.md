# Gooshie Travels

A private web app for sharing trips with friends — built on Next.js (Vercel) + Firebase, designed to run on free tiers.

This is **Phase 1**: sign-in (Google + magic link with an invite allowlist), the first trip, and a live day-by-day schedule imported from a Google Calendar.

## What's here

- **Auth** — Firebase Auth. Sign in with Google or a passwordless email "magic link".
- **Allowlist** — the admin (you) is set via env. Invited friends are added to the `allowlist` Firestore collection so they skip the pending queue; anyone else lands on a "pending" screen.
- **Live itinerary** — the server fetches your calendar's **secret iCal URL**, parses it, converts times to US-Eastern, and renders a day-by-day schedule. Multi-day hotel/Airbnb stays show as a "Based in" band. Vercel Cron refreshes it hourly.

## Setup

### 1. Firebase (free Spark tier — no card)

1. Create a project at <https://console.firebase.google.com>.
2. Add a **Web app**, copy the config keys.
3. **Authentication → Sign-in method**: enable **Google** and **Email/Password** (turn on *Email link / passwordless* under Email/Password).
4. **Firestore Database** → create (production mode).
5. Paste `firestore.rules` into **Firestore → Rules**.
6. Do **not** enable Storage yet (it requires the paid Blaze plan; uploads come in a later phase via a no-card host).

### 2. Environment variables

Copy `.env.example` to `.env.local` for local dev, and add the same keys in **Vercel → Settings → Environment Variables** for production:

| Variable | What |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` | The web config from Firebase. |
| `NEXT_PUBLIC_ADMIN_EMAIL` | Your email (lowercase). |
| `TRIP_ICAL_URL` | The calendar's **secret iCal address** (Google Calendar → calendar settings → *Secret address in iCal format*). Server-side only. |
| `CRON_SECRET` | Optional. If set, the cron refresh endpoint requires it. |

### 3. Run

```bash
npm install
npm run dev
```

### 4. Deploy

Import the repo in Vercel (Hobby/free), add the env vars above, deploy. After the first deploy, add your `*.vercel.app` domain to **Firebase → Authentication → Settings → Authorized domains** so login works in production.

## Inviting friends

Add a document to the `allowlist` collection with the **lowercased email** as the document ID (any field/value is fine — existence is what's checked). That email can then sign in without waiting.

## Trip Recap (public sharing)

At the end of a trip you can publish a **public recap page** — a curated highlight
reel anyone can open with the link, no login.

- **Build it** — on a trip, open the **Recap** tab (editors/admins only). Tick the
  places to feature, set a rating + recommendation blurb for each, pick which
  photos and comments to include, add a title/intro and a cover photo.
- **Publish** — hit **Publish**. The chosen photos are copied into a public
  gallery and the page goes live at `/r/<slug>`. Everything you didn't pick stays
  private. **Unpublish** takes it back offline.
- **Share** — copy the link from the Recap tab. The page is server-rendered with
  rich link previews (cover image + title), has clickable place details, and a
  full recommendations list visitors can filter by category and sort by rating.

This needs a **Firebase service account** (`FIREBASE_SERVICE_ACCOUNT`) so the
server can render public pages and copy photos — see the env table below. Also
re-paste `firestore.rules` and `storage.rules` after adding the recap feature
(they add public read for `recaps/*` and the `public/*` Storage prefix).

| Variable | What |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase console → Project settings → Service accounts → *Generate new private key*. Paste the JSON (or base64 of it). Server-side only. |

## Roadmap

- **Phase 2** — Planning tab (restaurant/vintage/booking lists) + Leaflet/OpenStreetMap map with toggleable layers + entity matching.
- **Phase 3** — photos & short video + comments (compressed, no-card media host).
- **Later** — planned-vs-actual analysis; document-ingest drag/reorder planner.
