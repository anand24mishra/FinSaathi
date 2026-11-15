import { config as loadEnv } from 'dotenv';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(here, '..');
const envPath = path.join(BACKEND_ROOT, '.env');

loadEnv({ path: envPath, quiet: true });

// Generate a JWT secret on first run and persist it to the (gitignored) .env.
if (!process.env.JWT_SECRET) {
  const secret = randomBytes(48).toString('hex');
  process.env.JWT_SECRET = secret;
  try {
    const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    appendFileSync(envPath, `${existing && !existing.endsWith('\n') ? '\n' : ''}JWT_SECRET=${secret}\n`, { mode: 0o600 });
  } catch {
    /* read-only FS: secret lives for this process only */
  }
}

const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : !['0', 'false', 'no', 'off'].includes(v.toLowerCase()));
const int = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : d;
};

export interface AppConfig {
  port: number;
  host: string;
  dbPath: string;
  jwtSecret: string;
  jwtTtlSec: number;
  anthropicApiKey: string | null;
  pushEnabled: boolean;
  schedulerEnabled: boolean;
  bodyLimitBytes: number;
  rate: { generalPerMin: number; authPerMin: number };
}

/** New installs use finsaathi.db; an existing anand.db keeps being used so no data is lost. */
function defaultDbPath(): string {
  const dir = path.join(BACKEND_ROOT, 'data');
  const fresh = path.join(dir, 'finsaathi.db'), legacy = path.join(dir, 'anand.db');
  return !existsSync(fresh) && existsSync(legacy) ? legacy : fresh;
}

export function loadConfig(): AppConfig {
  return {
    port: int(process.env.PORT, 4000),
    host: process.env.HOST || '0.0.0.0', // reachable from a phone on the same Wi-Fi; set HOST=127.0.0.1 to lock to this machine
    dbPath: process.env.FINSAATHI_DB_PATH || process.env.ANAND_DB_PATH || defaultDbPath(),
    jwtSecret: process.env.JWT_SECRET!,
    jwtTtlSec: 30 * 24 * 3600,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || null,
    pushEnabled: bool(process.env.PUSH_ENABLED, true),
    schedulerEnabled: bool(process.env.SCHEDULER_ENABLED, true),
    bodyLimitBytes: 256 * 1024,
    rate: { generalPerMin: int(process.env.RATE_GENERAL_PER_MIN, 240), authPerMin: int(process.env.RATE_AUTH_PER_MIN, 10) },
  };
}

export const config = loadConfig();
