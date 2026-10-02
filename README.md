# LG Device Lookup

A small local web app that looks up LG display MAC addresses and model info by
serial number, using LG Business Cloud's `/token` and `/devices/lookup` APIs.

## For teammates: how to run this

1. If you don't already have it, install **Node.js** from https://nodejs.org
   (choose the LTS version, click through the installer with defaults).
2. Unzip the folder you were given, if you haven't already.
3. **Windows:** double-click `start-windows.bat`
   **Mac:** double-click `start-mac.command`
   (If Mac blocks it as an unidentified app: right-click the file → Open →
   confirm Open, once. After that it'll run normally.)
4. Wait for the window to say the app is running, then it should open your
   browser automatically to http://localhost:3000. If it doesn't, just open
   that address manually.
5. Leave that black window open while you use the app. Closing it stops the
   app. Next time, just double-click the same file again — setup only
   happens once.

You do **not** need to touch the `.env` file — it's already filled in with
the shared API credentials.

---

## For whoever is packaging this for the team

Before zipping this up to share:

1. Copy `.env.example` to `.env`.
2. Fill in the real shared LG API key/secret from LG's Key Management page.
3. Delete the `node_modules` folder if present (each person's machine will
   generate its own on first run — don't ship it, it's large and
   platform-specific).
4. Zip the whole folder and share it (email, shared drive, etc.) — `.env`
   with the real credentials will be included this time, since it's what
   lets teammates skip any setup.

⚠️ Since everyone is sharing one API key/secret baked into this package,
treat the zip file itself as sensitive — share it only with the teammates
who need it, not somewhere broadly accessible.

---

## Setup (for local development / the person building this)

1. **Install Node.js** (v18+) if you don't have it: https://nodejs.org
2. **Install dependencies:** `npm install`
3. **Add credentials:** copy `.env.example` to `.env` and fill in your
   API key/secret from LG's Key Management page.
4. **Run it:** `npm start`, then open http://localhost:3000

## How it works

- The backend (`server.js`) requests a 24-hour access token from LG's
  `/token` endpoint, caches it in memory, and refreshes it automatically
  when it's close to expiring or if a request comes back unauthorized.
- Paste serial numbers into the form (one per line, or comma/space
  separated). Lists over 100 are automatically split into batches, since
  that's LG's per-request limit.
- Results show serial, found/not-found status, model, primary MAC, WiFi MAC,
  and manufacturing date.
- **Export for Connected Care (.xlsx)** downloads an Excel file matching
  Connected Care's bulk device upload template exactly: `Device Type` (always
  "Signage"), `Model Name`, `Serial Number`, `Ethernet MAC`, `WiFi MAC` — one
  row per successfully found device. Devices that weren't found are left out
  of this export since Connected Care's uploader expects real devices only.
- **Export CSV** is also available as a plain data dump of everything shown
  in the results table, including not-found rows.

## Known limitation: model number format

LG's `/devices/lookup` response includes a `model_name` field. In their own
docs example this returns a short code (e.g. `UR640`), not the longer
suffixed format sometimes printed on the unit or box (e.g.
`49UH5Q-EQ.AUSCLJR`). This app displays whatever LG's API returns as-is —
if you need the full suffixed model number, it's worth confirming with LG
whether that's available through this endpoint or a different one.

## Security notes

- Your API key/secret live only in your local `.env` file and are only ever
  sent to LG's servers — never exposed to the browser.
- If you deploy this somewhere other than your own machine (a shared server,
  etc.), make sure `.env` is excluded and access to the app itself is
  restricted, since anyone who can reach the app can trigger lookups using
  your API key.

## Project structure

```
lg-device-lookup/
├── server.js          # Express backend: auth + LG API calls
├── public/
│   └── index.html      # Frontend form + results table
├── package.json
├── .env.example         # Copy to .env and fill in credentials
└── README.md
```
