# Follow the Flow

A private menstrual cycle tracker that runs entirely in your browser. **No data is ever sent anywhere.**

## How it stays private without a server

"Sending no data" doesn't mean storing nothing. It means storing data **only on your device**:

- **No backend.** It's just static files (HTML/CSS/JS). There's no account, analytics, cookies or third-party scripts; everything, including React, is bundled into the app's own files.
- **The browser enforces it.** A Content-Security-Policy with `connect-src 'none'` blocks every network request from the page (fetch, XHR, WebSocket, beacons), so even a bug couldn't send your data.
- **Checked on every change.** Lint bans network APIs in the app's code, the build fails on any unexpected web address, and every end-to-end test fails if the app requests anything from another host.
- **Local storage only.** Your data is saved in this browser's `localStorage`.
- **Optional passphrase.** With a passphrase set, data is encrypted on the device (AES-GCM 256, PBKDF2-SHA256 key, 310k iterations). There's no recovery if you forget it.
- **Works offline.** A service worker caches the app's own files, and the app can be installed to your home screen (PWA).
- **Backups are files you own.** Export/Import creates and reads a JSON file (period days, moods, sleep and habits) on your device. Use it to move to another phone or keep a backup.

> ⚠️ Clearing your browser's site data deletes your history. Export a backup regularly.
> Exported backup files are **not** encrypted, so keep them somewhere safe.

## Features

- Tap days on the calendar to log your period (or use "Period started today")
- Average cycle and period length from your last 6 cycles (outliers under 15 or over 60 days are ignored)
- Next-period prediction, plus estimated fertile window and ovulation (14 days before the next period)
- Cycle history table
- **Mood tracking**: log one or more moods for today in one tap each, or any past day (switch the calendar to "Mood" mode)
- **Mood forecast** for the next 7 days, unlocked after ~2 months of mood logging (60 days of history and at least 15 entries). For each upcoming day it looks at the moods you logged on the same cycle day (±2 days, nearer days count more) over the last ~6 months and shows how often each mood came up (moods seen on 40% or more of those days, up to 3). Everything is computed on your device.
- **Sleep / insomnia tracking**: each morning, log a bad night as 🥱 Poor sleep or 🦉 Insomnia (nights you don't log count as normal). Past nights can be logged from the calendar in "Mood & sleep" mode, and the calendar marks them (ring = poor sleep, filled dot = insomnia). The app shows your last 30 days and, after ~2 months of tracking, the share of bad nights in each part of your cycle. It also points out the phase where they're most common and gives a heads-up when that phase is coming.
- **Habit tracking**: tap what happened each day: 🏃 Exercise, ☕ Caffeine, 🍷 Alcohol, 😣 Stress, 📅 Meetings (some / a lot / all day), 👯 Social time, 🛋️ Alone time, 🤒 Sick, 😖 Cramps, 🤕 Headache, 🤢 Digestion issues. Tap again for a level (e.g. ☕ 1 / 2 / 3 / 4 / 5+ cups; caffeine and alcohol are also compared at 3+). Hide the ones you don't need and add your own. If nothing applies, tap "None of these" so the day still counts; days you don't log are left out of the analysis. Past days can be logged from the calendar.
- **What affects your sleep and mood**: after ~2 months of habit logging, the app lists habits linked to bad nights (the night after a habit day) or to particular moods (the same day), and the part of your cycle where each habit is most common. Each habit is compared with days without it *in the same cycle phases*, so something that just happens more before your period isn't blamed for PMS. A link is only shown when there are at least 8 days with and 8 without the habit, and the difference is clear (15+ points and 1.5× either way). These are patterns in your own data, not proof of cause.
- **Monthly recap** under the calendar, for whichever month the calendar shows (updated live for the current month): the overall mood (a good, mixed or tough month, from days with 😄/😌 vs 😢/😠/😰) with your top moods, the period that started that month and whether it came early or late compared with your previous cycles, bad nights, sick days and most-logged habits, and what changed compared with the month before. Sick days show 🤒 on the calendar.
- **Recap charts & insights**: one line chart for the month (one point per day) or the year (one point per month) where you pick which lines to show: alcohol, meetings, caffeine, bad nights, stress, exercise and sick days, up to 3 at a time so they stay easy to tell apart (colours are checked for colour-blind readers, and a line keeps its colour while it's shown). Your choice is saved with your data. To share one scale, the month view draws each line from none to its highest level (5+ drinks, meetings all day…), and the year view shows the share of logged days with each habit. A day counts once you've logged anything for it (habits, a mood or a bad night): habits you didn't tap that day count as none. Days or months with nothing logged at all leave a gap. Tap the chart for exact values, or open "See the numbers" for a table. Insights point out heavy days (3+ drinks, 3+ cups, meetings a lot or all day), the days of the week they cluster on, the part of your cycle they fall in, and how often tough moods or bad nights came with them, compared with your other days.
- **Weekly backup reminder**: a banner appears when your last export is 7 or more days old ("Export now" or "Remind me tomorrow"). It's an in-app banner because real push notifications would need a server.
- Light/dark mode

Predictions are estimates. They are not medical advice and not a form of contraception.

## Develop

The app is React + TypeScript + Tailwind, built with [Vite](https://vite.dev). You need Node 22.

```sh
npm install
npm run dev        # dev server with hot reload
npm test           # unit tests (Vitest, tests/unit)
npm run build      # production build in dist/
npm run e2e        # end-to-end tests (Playwright, tests/e2e) against the build
npm run lint       # ESLint; npm run typecheck and npm run format:check too
```

The first `npm run e2e` needs a browser: `npx playwright install chromium`.

### Where things are

| Path | What |
|---|---|
| `src/lib/` | All the logic as plain TypeScript, no React: dates, cycle maths and predictions (`cycle.ts`), mood forecast, sleep pattern, habit links, monthly recap, chart data, backups, encryption, and every data change (`actions.ts`). Every function takes its inputs, so each can be tested on its own. Thresholds live in `catalog.ts`. |
| `src/store/` | `AppStore.tsx` holds the data, the passphrase lock and today's date, and saves every change; `storage.ts` is the only code that touches `localStorage`. |
| `src/components/` | One component per card (Summary, Mood, Sleep, Habits, Calendar, monthly recap…), with shared bits in `ui/`. |
| `tests/unit/` | Unit tests for `src/lib`. |
| `tests/e2e/` | Browser tests on a fixed date that fail on any outside request or page error. |
| `tests/fixtures/` | Test data, including a year of sample logs and data encrypted by an earlier version. |

The stored format (`ftf:v1` in `localStorage`) and the backup file (version 5) are unchanged since earlier versions, so existing data keeps working. Change them only with a migration in `src/lib/backup.ts` (`sanitize`).

### Publish on GitHub Pages

1. The repo must be **public** (or you need GitHub Pro for Pages on a private repo).
   Making the code public is safe: the code contains no personal data, and your data never leaves your device.
2. **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
3. Every push to `master` runs `.github/workflows/deploy.yml`: unit tests, build, URL check and end-to-end tests, then it publishes `dist/`. Nothing is published if a test fails.
4. It's live at `https://<your-username>.github.io/follow-the-flow/`. On your phone, open that link and use **Add to Home Screen** to install it like an app. It then works offline.

Any static host works too (Netlify, Cloudflare Pages…): publish the `dist/` folder. The host only serves the files. It never sees your data, because the app never sends any.
