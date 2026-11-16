import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Profile, User, Lang } from '../../../shared/contract';
import { stmt } from '../db';

export const DEFAULT_PROFILE: Profile = {
  language: 'en', textScale: 1, theme: 'system', riskLevel: 'balanced', experience: 'beginner',
  capital: null, monthlyBudget: null, horizonYears: 5, goals: [], onboarded: false,
};

const goalEnum = z.enum(['retirement', 'child_education', 'house', 'emergency', 'wealth', 'regular_income']);
export const profileUpdateSchema = z.object({
  language: z.enum(['en', 'hi']),
  textScale: z.union([z.literal(1), z.literal(1.15), z.literal(1.3)]),
  theme: z.enum(['system', 'light', 'dark']),
  riskLevel: z.enum(['conservative', 'balanced', 'growth']),
  experience: z.enum(['beginner', 'some', 'experienced']),
  capital: z.number().min(0).max(1e12).nullable(),
  monthlyBudget: z.number().min(0).max(1e10).nullable(),
  horizonYears: z.number().int().min(1).max(60),
  goals: z.array(goalEnum).max(6),
  onboarded: z.boolean(),
}).partial().strict();

interface UserRow { id: string; name: string; email: string; pw_salt: string; pw_hash: string; profile: string; push_token: string | null; created_at: string }

function parseProfile(json: string): Profile {
  try { return { ...DEFAULT_PROFILE, ...JSON.parse(json) }; } catch { return { ...DEFAULT_PROFILE }; }
}
const toUser = (r: UserRow): User => ({ id: r.id, name: r.name, email: r.email, profile: parseProfile(r.profile), createdAt: r.created_at });

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export const findUserRowByEmail = (email: string) => stmt('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email)) as UserRow | undefined;

export function createUser(input: { name: string; email: string; salt: string; hash: string; language?: Lang }): User {
  const id = randomUUID();
  const now = new Date().toISOString();
  const profile: Profile = { ...DEFAULT_PROFILE, language: input.language ?? 'en' };
  stmt('INSERT INTO users(id,name,email,pw_salt,pw_hash,profile,created_at,last_active_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, input.name.trim(), normalizeEmail(input.email), input.salt, input.hash, JSON.stringify(profile), now, now);
  return { id, name: input.name.trim(), email: normalizeEmail(input.email), profile, createdAt: now };
}

export const GUEST_EMAIL_SUFFIX = '@guest.finsaathi.app';
/** Turn an anonymous guest account into a normal one (real name, email, password). Keeps the id, profile and portfolio. */
export function claimAccount(userId: string, input: { name: string; email: string; salt: string; hash: string }): User | null {
  const row = stmt('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!row || !row.email.endsWith(GUEST_EMAIL_SUFFIX)) return null;
  stmt('UPDATE users SET name = ?, email = ?, pw_salt = ?, pw_hash = ? WHERE id = ?').run(input.name.trim(), normalizeEmail(input.email), input.salt, input.hash, userId);
  return getUser(userId);
}

export function getUser(userId: string): User | null {
  const r = stmt('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  return r ? toUser(r) : null;
}

export function getProfile(userId: string): Profile {
  const u = getUser(userId);
  return u ? u.profile : { ...DEFAULT_PROFILE };
}

export function updateProfile(userId: string, patch: Partial<Profile>): User | null {
  const u = getUser(userId);
  if (!u) return null;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const merged = { ...u.profile, ...clean };
  stmt('UPDATE users SET profile = ? WHERE id = ?').run(JSON.stringify(merged), userId);
  return { ...u, profile: merged };
}

export function setPushToken(userId: string, token: string, platform: string): void {
  stmt('UPDATE users SET push_token = ?, push_platform = ? WHERE id = ?').run(token, platform, userId);
}
export const getPushToken = (userId: string): string | null =>
  ((stmt('SELECT push_token FROM users WHERE id = ?').get(userId) as { push_token: string | null } | undefined)?.push_token) ?? null;

export function touchActive(userId: string): void {
  stmt('UPDATE users SET last_active_at = ? WHERE id = ?').run(new Date().toISOString(), userId);
}
export const listRecentlyActiveUserIds = (sinceIso: string): string[] =>
  (stmt('SELECT id FROM users WHERE last_active_at >= ?').all(sinceIso) as { id: string }[]).map((r) => r.id);
