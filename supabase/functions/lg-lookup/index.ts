// Supabase Edge Function: proxies serial-number lookups to LG Business Cloud.
// The LG key/secret live only in Supabase function secrets — never in the browser.

const LG_BASE_URL = 'https://kic-api.lgbusinesscloud.com';
// Trim in case of accidental copy/paste whitespace in the secret values
const LG_API_KEY = (Deno.env.get('LG_API_KEY') || '').trim();
const LG_API_SECRET = (Deno.env.get('LG_API_SECRET') || '').trim();
// Shared team password. Anyone who can reach this function could otherwise
// run lookups on our LG account, since the Pages URL is public.
const APP_PASSWORD = (Deno.env.get('APP_PASSWORD') || '').trim();
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-app-password, authorization, apikey',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// --- Simple in-memory token cache ---
// Survives between invocations while the function instance stays warm.
// LG tokens are valid for 24 hours; we refresh a bit early to be safe.
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function lgFetch(path: string, headers: Record<string, string>, body?: string) {
  try {
    return await fetch(`${LG_BASE_URL}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
      body,
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(`Request to LG ${path} timed out after 10 seconds.`);
    }
    throw new Error(`Network error reaching LG ${path}: ${(err as Error).message}`);
  }
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await lgFetch('/token', { 'X-Api-Key': LG_API_KEY, 'X-Api-Secret': LG_API_SECRET });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`LG token endpoint returned a non-JSON response (HTTP ${res.status}): ${raw.slice(0, 200)}`);
  }

  // LG's docs describe the token nested under `result.access_token`, but in
  // practice the live API has been observed returning it at the top level
  // as `access_token`. Handle both shapes defensively.
  const token = data?.result?.access_token || data?.access_token;
  if (!res.ok || !token) {
    console.error('LG /token response body:', JSON.stringify(data));
    throw new Error(`Failed to obtain LG access token: ${res.status} ${JSON.stringify(data)}`);
  }

  cachedToken = token;
  // Valid for 24h per docs; refresh 1 hour early to avoid edge-of-expiry failures.
  tokenExpiresAt = now + 23 * 60 * 60 * 1000;
  return token;
}

async function lookupBatch(serials: string[], token: string) {
  const res = await lgFetch(
    '/devices/lookup',
    { 'X-Api-Key': LG_API_KEY, 'X-Api-Token': token },
    JSON.stringify(serials),
  );
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { status: { message: raw.slice(0, 200) } };
  }
  return { ok: res.ok, status: res.status, data };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  if (!LG_API_KEY || !LG_API_SECRET || !APP_PASSWORD) {
    return json({ error: 'Server is missing LG_API_KEY, LG_API_SECRET or APP_PASSWORD secrets.' }, 500);
  }
  if (req.headers.get('x-app-password') !== APP_PASSWORD) {
    return json({ error: 'Incorrect team password.' }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const serials = Array.isArray(body?.serials) ? body.serials : [];
    const cleaned = [...new Set(serials.map((s: unknown) => String(s).trim()).filter(Boolean))] as string[];

    if (cleaned.length === 0) {
      return json({ error: 'No serial numbers provided.' }, 400);
    }

    let token = await getAccessToken();
    let allResults: unknown[] = [];

    for (const batch of chunk(cleaned, 100)) { // API max is 100 serials per request
      let { ok, status, data } = await lookupBatch(batch, token);

      // If token expired/invalid mid-run, refresh once and retry this batch.
      if (!ok && (status === 401 || status === 403)) {
        token = await getAccessToken(true);
        ({ ok, status, data } = await lookupBatch(batch, token));
      }

      if (!ok) {
        // Don't pass LG's 401/403 through as-is — the page treats 401 as a wrong team password.
        return json({ error: `LG API error on a batch: ${data?.status?.message || status}`, details: data }, 502);
      }

      allResults = allResults.concat(data?.result || data?.results || (Array.isArray(data) ? data : []));
    }

    return json({ results: allResults });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message || 'Unexpected server error.' }, 500);
  }
});
