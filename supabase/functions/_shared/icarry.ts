// supabase/functions/_shared/icarry.ts
const BASE = 'https://www.icarry.in';
let cached: { token: string; exp: number } | null = null;

// iCarry expects FORM fields with bracket keys (consignee[name], parcel[weight][unit]), not JSON.
export const flatten = (obj: any, prefix = '', out = new URLSearchParams()): URLSearchParams => {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === 'object') {
      flatten(v, key, out);
    } else if (v !== undefined && v !== null && v !== '') {
      out.append(key, String(v));
    }
  }
  return out;
};

export async function getToken(force = false): Promise<string> {
  if (!force && cached && cached.exp > Date.now()) {
    return cached.token;
  }

  const username = Deno.env.get('ICARRY_USERNAME');
  const key = Deno.env.get('ICARRY_KEY');

  if (!username || !key) {
    throw new Error('Missing ICARRY_USERNAME or ICARRY_KEY environment variables');
  }

  const res = await fetch(`${BASE}/api_login`, {
    method: 'POST',
    body: new URLSearchParams({
      username,
      key,
    }),
  });

  const j = await res.json();
  if (!j.api_token) {
    const errText = JSON.stringify(j.error ?? j);
    console.error('iCarry login failed:', errText);
    throw new Error(`iCarry login failed: ${errText}`);
  }

  console.log('login ok');
  cached = { token: j.api_token, exp: Date.now() + 55 * 60 * 1000 }; // tokens valid for 60 min
  return j.api_token;
}

// NOTE: the doc's URLs are literally "<endpoint>&api_token=<token>" (an "&" right after the
// endpoint, no "?"). Use it exactly like this first. If iCarry returns 404, try "?api_token=".
export async function icarryCall(endpoint: string, fields: any, retry = true): Promise<any> {
  const token = await getToken();
  const res = await fetch(`${BASE}/${endpoint}&api_token=${token}`, {
    method: 'POST',
    body: flatten(fields),
  });

  // Log only the endpoint name and HTTP status code, not the request body or token
  console.log(`iCarry call: ${endpoint} -> HTTP ${res.status}`);

  const text = await res.text();
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`iCarry non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  if (retry && j.error && /token|session|login/i.test(JSON.stringify(j.error))) {
    await getToken(true);
    return icarryCall(endpoint, fields, false);
  }

  return j;
}

export const ENDPOINTS = {
  pincode:  'api_check_pincode',
  estimate: 'api_get_estimate',
  book:     'api_add_shipment_surface',
  cancel:   'api_cancel_shipment',
  track:    'api_track_shipment',
  label:    'api_print_shipment_label',
} as const;
