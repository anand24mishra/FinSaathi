import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { ApiError as ApiErrorBody, Lang } from './contract';

const API_PORT = process.env.EXPO_PUBLIC_API_PORT || '4000';
const isLocal = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '::1';

/** Where the backend lives. A phone cannot reach "localhost" (that is the phone itself), so unless an explicit
 *  EXPO_PUBLIC_API_URL is given, use the same machine that is serving the app: the Expo dev server host on a device,
 *  or the page's own host on the web. */
export function resolveApiBase(): string {
  const env = (process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  if (env) {
    try {
      const host = new URL(env).hostname;
      if (!(isLocal(host) && Platform.OS !== 'web')) return env; // localhost is only valid on the web
    } catch { return env; }
  }
  let host = '';
  if (Platform.OS === 'web') {
    host = typeof window !== 'undefined' ? window.location.hostname : '';
  } else {
    const uri = (Constants.expoConfig as { hostUri?: string } | null)?.hostUri || (Constants as { linkingUri?: string }).linkingUri || '';
    host = uri.replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0];
  }
  if (!host) host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${host}:${API_PORT}`;
}
export const API_BASE: string = resolveApiBase();
const PREFIX = '/v1';

export class ApiError extends Error {
  code: string; status: number; retryable: boolean;
  constructor(code: string, message: string, status = 0, retryable = false) {
    super(message);
    this.name = 'ApiError';
    this.code = code; this.status = status; this.retryable = retryable;
  }
  get isNetwork() { return this.code === 'network' || this.code === 'timeout'; }
}

/** Pure mapping from an HTTP response to an ApiError (unit-tested). */
export function mapError(status: number, body: unknown): ApiError {
  const b = body as Partial<ApiErrorBody> | null;
  if (b && typeof b === 'object' && b.error && typeof b.error.message === 'string') {
    return new ApiError(b.error.code || `http_${status}`, b.error.message, status, !!b.error.retryable);
  }
  if (status === 401) return new ApiError('unauthorized', 'Please sign in again.', status, false);
  if (status === 404) return new ApiError('not_found', 'Not found.', status, false);
  if (status === 429) return new ApiError('rate_limited', 'Too many requests. Please wait a moment.', status, true);
  if (status >= 500) return new ApiError('server', 'The server had a problem.', status, true);
  return new ApiError(`http_${status}`, 'Something went wrong.', status, false);
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
export function setAuthToken(t: string | null) { authToken = t; }
export function getAuthToken() { return authToken; }
export function setUnauthorizedHandler(fn: (() => void) | null) { onUnauthorized = fn; }

type Opts = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; query?: Record<string, string | number | undefined | null>; timeoutMs?: number; retries?: number; signal?: AbortSignal };

export function buildUrl(path: string, query?: Opts['query']): string {
  const p = path.startsWith('/v1') ? path : PREFIX + (path.startsWith('/') ? path : '/' + path);
  const qs = query ? Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') : '';
  const sep = p.includes('?') ? '&' : '?';
  return API_BASE + p + (qs ? sep + qs : '');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function once<T>(url: string, o: Opts): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, {
      method: o.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      signal: ctrl.signal,
    });
    let json: unknown = null;
    try { json = await res.json(); } catch { json = null; }
    if (!res.ok) {
      const err = mapError(res.status, json);
      if (res.status === 401 && authToken && onUnauthorized) onUnauthorized();
      throw err;
    }
    return json as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const aborted = (e as { name?: string })?.name === 'AbortError';
    throw new ApiError(aborted ? 'timeout' : 'network', aborted ? 'The server took too long to answer.' : 'Could not reach the server.', 0, true);
  } finally { clearTimeout(timer); }
}

export async function request<T>(path: string, o: Opts = {}): Promise<T> {
  const url = buildUrl(path, o.query);
  const method = o.method ?? 'GET';
  const retries = o.retries ?? (method === 'GET' ? 2 : 0); // retry only idempotent GETs
  let attempt = 0;
  for (;;) {
    try { return await once<T>(url, o); } catch (e) {
      const err = e as ApiError;
      if (attempt >= retries || !err.retryable) throw err;
      attempt++;
      await sleep(400 * 2 ** (attempt - 1));
    }
  }
}

export const api = {
  get: <T>(path: string, query?: Opts['query'], o?: Opts) => request<T>(path, { ...o, query }),
  post: <T>(path: string, body?: unknown, o?: Opts) => request<T>(path, { ...o, method: 'POST', body: body ?? {} }),
  put: <T>(path: string, body?: unknown, o?: Opts) => request<T>(path, { ...o, method: 'PUT', body }),
  del: <T>(path: string, o?: Opts) => request<T>(path, { ...o, method: 'DELETE' }),
};

export function withLang(path: string, lang: Lang): string {
  return path + (path.includes('?') ? '&' : '?') + 'lang=' + lang;
}
