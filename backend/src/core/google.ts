// Google sign-in: the app obtains a Google ID token natively; the server verifies it with Google and issues its own session token.
// Only the public client IDs are needed here. The OAuth client secret is NOT used (and must not be stored) for ID-token verification.
export const GOOGLE_CLIENT_IDS = (process.env.GOOGLE_CLIENT_IDS
  ?? '1021725772672-4qf75s4qj91bt1u0iqvi5lj5dmr94hiq.apps.googleusercontent.com,1021725772672-6o6alok8s041edk82oit4l7o6idue9h2.apps.googleusercontent.com')
  .split(',').map((s) => s.trim()).filter(Boolean);

export interface GoogleIdentity { sub: string; email: string; name: string }
type FetchFn = typeof fetch;
let fetchImpl: FetchFn = fetch;
export const __setGoogleFetch = (f: FetchFn | null) => { fetchImpl = f ?? fetch; };

/** Verifies an ID token via Google's tokeninfo endpoint (checks signature, expiry and issuer server-side). Returns null when invalid. */
export async function verifyGoogleIdToken(idToken: string, now = Date.now(), allowed: string[] = GOOGLE_CLIENT_IDS): Promise<GoogleIdentity | null> {
  if (!idToken || idToken.length > 4096) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: ctl.signal });
    if (!res.ok) return null;
    const j: any = await res.json();
    const issuerOk = j.iss === 'https://accounts.google.com' || j.iss === 'accounts.google.com';
    const audOk = typeof j.aud === 'string' && allowed.includes(j.aud);
    const notExpired = Number(j.exp) * 1000 > now;
    const verified = j.email_verified === true || j.email_verified === 'true';
    if (!issuerOk || !audOk || !notExpired || !verified || !j.sub || !j.email) return null;
    return { sub: String(j.sub), email: String(j.email), name: String(j.name ?? '') };
  } catch { return null; }
  finally { clearTimeout(t); }
}
