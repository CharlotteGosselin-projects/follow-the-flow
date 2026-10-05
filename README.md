# Follow the Flow

A private menstrual cycle tracker that runs entirely in your browser. **No data is ever sent anywhere.**

## How it stays private without a server

"Sending no data" doesn't mean storing nothing. It means storing data **only on your device**:

- **No backend.** It's just static files (HTML/CSS/JS). There's no account, analytics, cookies or third-party scripts.
- **The browser enforces it.** A Content-Security-Policy with `connect-src 'none'` blocks every network request from the page (fetch, XHR, WebSocket, beacons), so even a bug couldn't send your data.
- **Local storage only.** Period days are saved in this browser's `localStorage`.
- **Optional passphrase.** With a passphrase set, data is encrypted on the device (AES-GCM 256, PBKDF2-SHA256 key, 310k iterations). There's no recovery if you forget it.
- **Works offline.** A service worker caches the app's own files, and the app can be installed to your home screen (PWA).
- **Backups are files you own.** Export/Import creates and reads a JSON file (period days and moods) on your device. Use it to move to another phone or keep a backup.

> ⚠️ Clearing your browser's site data deletes your history. Export a backup regularly.
> Exported backup files are **not** encrypted, so keep them somewhere safe.

## Features

- Tap days on the calendar to log your period (or use "Period started today")
- Average cycle and period length from your last 6 cycles (outliers under 15 or over 60 days are ignored)
- Next-period prediction, plus estimated fertile window and ovulation (14 days before the next period)
- Cycle history table
- **Mood tracking**: log how you feel today in one tap, or any past day (switch the calendar to "Mood" mode)
- **Mood forecast** for the next 7 days, unlocked after ~2 months of mood logging (60 days of history and at least 15 entries). For each upcoming day it looks at the moods you logged on the same cycle day (±2 days, nearer days count more) over the last ~6 months and shows the most frequent one with a confidence %. Everything is computed on your device.
- **Weekly backup reminder**: a banner appears when your last export is 7 or more days old ("Export now" or "Remind me tomorrow"). It's an in-app banner because real push notifications would need a server.
- Light/dark mode

Predictions are estimates. They are not medical advice and not a form of contraception.

## Run it

Any static file server works:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

To use it on your phone, host it on any static host (GitHub Pages, Netlify, Cloudflare Pages). The host only serves the files. It never sees your data, because the app never sends any.
