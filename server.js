require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
// Trim in case of accidental copy/paste whitespace or trailing newlines in .env
const LG_API_KEY = (process.env.LG_API_KEY || '').trim();
const LG_API_SECRET = (process.env.LG_API_SECRET || '').trim();
const LG_BASE_URL = 'https://kic-api.lgbusinesscloud.com';

if (!LG_API_KEY || !LG_API_SECRET) {
  console.warn(
    '\n⚠️  LG_API_KEY / LG_API_SECRET not found in environment.\n' +
    '   Copy .env.example to .env and fill in your credentials.\n'
  );
} else {
  // Debug info only — never prints the actual secret value.
  console.log(
    `Loaded LG_API_KEY (length ${LG_API_KEY.length}, starts "${LG_API_KEY.slice(0, 4)}...") ` +
    `and LG_API_SECRET (length ${LG_API_SECRET.length}).`
  );
}

// --- Simple in-memory token cache ---
// LG tokens are valid for 24 hours; we refresh a bit early to be safe.
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  console.log('Requesting new token from LG...');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  let res;
  try {
    res = await fetch(`${LG_BASE_URL}/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Api-Key': LG_API_KEY,
        'X-Api-Secret': LG_API_SECRET,
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        'Request to LG /token timed out after 10 seconds. This usually means a firewall, ' +
        'VPN, or proxy on this network is silently blocking the connection to kic-api.lgbusinesscloud.com. ' +
        'Try a different network, or check with IT about outbound access to that host.'
      );
    }
    throw new Error(`Network error reaching LG /token: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  console.log('Got response from LG /token:', res.status);

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `LG token endpoint returned a non-JSON response (HTTP ${res.status}): ${raw.slice(0, 200)}`
    );
  }

  // LG's docs describe the token nested under `result.access_token`, but in
  // practice the live API has been observed returning it at the top level
  // as `access_token`. Handle both shapes defensively.
  const token = data?.result?.access_token || data?.access_token;

  if (!res.ok || !token) {
    console.error('LG /token response headers:', Object.fromEntries(res.headers.entries()));
    console.error('LG /token response body:', JSON.stringify(data));
    throw new Error(
      `Failed to obtain LG access token: ${res.status} ${JSON.stringify(data)}`
    );
  }

  cachedToken = token;
  // Valid for 24h per docs; refresh 1 hour early to avoid edge-of-expiry failures.
  tokenExpiresAt = now + 23 * 60 * 60 * 1000;
  return cachedToken;
}

async function lookupBatch(serials, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  let res;
  try {
    res = await fetch(`${LG_BASE_URL}/devices/lookup`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Api-Key': LG_API_KEY,
        'X-Api-Token': token,
      },
      body: JSON.stringify(serials),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        'Request to LG /devices/lookup timed out after 10 seconds. This usually means a firewall, ' +
        'VPN, or proxy on this network is silently blocking the connection to kic-api.lgbusinesscloud.com.'
      );
    }
    throw new Error(`Network error reaching LG /devices/lookup: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { status: { message: raw.slice(0, 200) } };
  }
  return { ok: res.ok, status: res.status, data };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// POST /api/lookup  { serials: string[] }
app.post('/api/lookup', async (req, res) => {
  try {
    const serials = Array.isArray(req.body?.serials) ? req.body.serials : [];
    const cleaned = [...new Set(serials.map((s) => String(s).trim()).filter(Boolean))];
    console.log(`Received lookup request for ${cleaned.length} serial(s).`);

    if (cleaned.length === 0) {
      return res.status(400).json({ error: 'No serial numbers provided.' });
    }

    let token = await getAccessToken();
    const batches = chunk(cleaned, 100); // API max is 100 serials per request
    let allResults = [];

    for (const batch of batches) {
      let { ok, status, data } = await lookupBatch(batch, token);

      // If token expired/invalid mid-run, refresh once and retry this batch.
      if (!ok && (status === 401 || status === 403)) {
        token = await getAccessToken(true);
        ({ ok, status, data } = await lookupBatch(batch, token));
      }

      console.log(`Lookup batch response (status ${status}):`, JSON.stringify(data).slice(0, 500));

      if (!ok) {
        return res.status(status).json({
          error: `LG API error on a batch: ${data?.status?.message || status}`,
          details: data,
        });
      }

      allResults = allResults.concat(data?.result || data?.results || (Array.isArray(data) ? data : []));
    }

    res.json({ results: allResults });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Unexpected server error.' });
  }
});

app.listen(PORT, () => {
  console.log(`LG device lookup app running at http://localhost:${PORT}`);
});
