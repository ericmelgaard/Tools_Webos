# LG Device Lookup

A web page for looking up LG display MAC addresses and model info by serial
number, using LG Business Cloud's `/token` and `/devices/lookup` APIs.

- **Frontend:** a static page in [`site/`](site/), published to GitHub Pages.
- **Backend:** a Supabase Edge Function in
  [`supabase/functions/lg-lookup/`](supabase/functions/lg-lookup/) that holds
  the LG key/secret and calls LG on the page's behalf. The key never reaches
  the browser.
- **Deploys:** every push to `main` runs
  [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which syncs
  secrets to Supabase, deploys the function, then publishes the page.

## For teammates

Open the GitHub Pages URL, enter the team password once (your browser
remembers it), paste serial numbers and click **Look up devices**.

## One-time setup

1. **Supabase:** note your project ref (the `xxxx` in
   `https://xxxx.supabase.co`) and create a personal access token at
   https://supabase.com/dashboard/account/tokens.
2. **GitHub → Settings → Secrets and variables → Actions:**
   - Secrets: `SUPABASE_ACCESS_TOKEN`, `LG_API_KEY`, `LG_API_SECRET`,
     `APP_PASSWORD` (the shared team password, pick anything)
   - Variables tab: `SUPABASE_PROJECT_REF`
3. **GitHub → Settings → Pages:** set **Source** to **GitHub Actions**.
4. Push to `main` (or run the **Deploy** workflow manually from the Actions
   tab). The Pages URL appears on the workflow run.

To change the password or LG credentials, update the GitHub Secret and re-run
the **Deploy** workflow.

## How it works

- The function requests a 24-hour access token from LG's `/token` endpoint,
  caches it while the function stays warm, and refreshes it when it's close
  to expiring or if LG rejects it.
- Requests without the correct `x-app-password` header are rejected, so only
  people with the team password can spend lookups on our LG account. The
  function only accepts browser calls from `webos.tools.wanddigital.com` and
  this account's `github.io` origin (set in `deploy.yml`).
- Lists over 100 serials are split into batches (LG's per-request limit).
- **Export for LGCC (.xlsx)**: `Device Type`, `Model Name`, `Serial Number`
  for found devices, matching LGCC's bulk import template.
- **Export MAC Addresses (.xlsx)**: model, serial, Ethernet MAC, WiFi MAC for
  found devices.
- **Export CSV**: everything in the results table, including not-found rows.

## Local development (optional)

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli).

1. Copy `.env.example` to `.env` and fill it in (`.env` is git-ignored).
2. `supabase functions serve lg-lookup --env-file .env --no-verify-jwt`
3. Set `apiUrl` in `site/config.js` to
   `http://localhost:54321/functions/v1/lg-lookup` and open `site/index.html`
   through any static server (don't commit that change).

## Known limitation: model number format

LG's `/devices/lookup` returns a short `model_name` (e.g. `UR640`), not the
longer suffixed format sometimes printed on the unit (e.g.
`49UH5Q-EQ.AUSCLJR`). The app shows whatever LG returns.
