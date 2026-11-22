import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Profile, User, Lang } from '../../../shared/contract';
import { isDuplicateKey, users, type UserDoc } from '../store';

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

interface UserRow { id: string; name: string; email: string; pw_salt: string; pw_hash: string; profile: Profile; push_token: string | null; created_at: string }

const parseProfile = (p: unknown): Profile => ({ ...DEFAULT_PROFILE, ...((p && typeof p === 'object' ? p : {}) as Partial<Profile>) });
const toRow = (d: UserDoc): UserRow => ({ id: d._id, name: d.name, email: d.email, pw_salt: d.pw_salt, pw_hash: d.pw_hash, profile: parseProfile(d.profile), push_token: d.push_token ?? null, created_at: d.created_at });
const toUser = (r: UserRow): User => ({ id: r.id, name: r.name, email: r.email, profile: r.profile, createdAt: r.created_at });

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function findUserRowByEmail(email: string): Promise<UserRow | undefined> {
  const d = await users().findOne({ email: normalizeEmail(email) });
  return d ? toRow(d) : undefined;
}

/** Throws a duplicate-key error (see isDuplicateKey) when the email is already registered. */
export async function createUser(input: { name: string; email: string; salt: string; hash: string; language?: Lang; googleSub?: string }): Promise<User> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const profile: Profile = { ...DEFAULT_PROFILE, language: input.language ?? 'en' };
  const doc: UserDoc = { _id: id, name: input.name.trim(), email: normalizeEmail(input.email), pw_salt: input.salt, pw_hash: input.hash, profile, push_token: null, push_platform: null, created_at: now, last_active_at: now };
  if (input.googleSub) doc.google_sub = input.googleSub;
  await users().insertOne(doc);
  return { id, name: doc.name, email: doc.email, profile, createdAt: now };
}

export const GUEST_EMAIL_SUFFIX = '@guest.finsaathi.app';
/** Turn an anonymous guest account into a normal one (real name, email, password). Keeps the id, profile and portfolio. */
export async function claimAccount(userId: string, input: { name: string; email: string; salt: string; hash: string }): Promise<User | null> {
  const d = await users().findOne({ _id: userId }, { projection: { email: 1 } });
  if (!d || !d.email.endsWith(GUEST_EMAIL_SUFFIX)) return null;
  await users().updateOne({ _id: userId }, { $set: { name: input.name.trim(), email: normalizeEmail(input.email), pw_salt: input.salt, pw_hash: input.hash } });
  return getUser(userId);
}

export async function getUser(userId: string): Promise<User | null> {
  const d = await users().findOne({ _id: userId });
  return d ? toUser(toRow(d)) : null;
}

export async function getProfile(userId: string): Promise<Profile> {
  const u = await getUser(userId);
  return u ? u.profile : { ...DEFAULT_PROFILE };
}

export async function updateProfile(userId: string, patch: Partial<Profile>): Promise<User | null> {
  const u = await getUser(userId);
  if (!u) return null;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const merged = { ...u.profile, ...clean } as Profile;
  await users().updateOne({ _id: userId }, { $set: { profile: merged } });
  return { ...u, profile: merged };
}

export async function setPushToken(userId: string, token: string, platform: string): Promise<void> {
  await users().updateOne({ _id: userId }, { $set: { push_token: token, push_platform: platform } });
}
export async function getPushToken(userId: string): Promise<string | null> {
  return (await users().findOne({ _id: userId }, { projection: { push_token: 1 } }))?.push_token ?? null;
}

export async function touchActive(userId: string): Promise<void> {
  await users().updateOne({ _id: userId }, { $set: { last_active_at: new Date().toISOString() } });
}
export async function listRecentlyActiveUserIds(sinceIso: string): Promise<string[]> {
  return (await users().find({ last_active_at: { $gte: sinceIso } }, { projection: { _id: 1 } }).toArray()).map((d) => d._id);
}

/** Sign in with Google: find by Google id, else link to an existing account with the same email, else create one. */
export async function upsertGoogleUser(g: { sub: string; email: string; name: string; language?: Lang }, randomSecret: { salt: string; hash: string }): Promise<User> {
  const bySub = await users().findOne({ google_sub: g.sub });
  if (bySub) return toUser(toRow(bySub));
  const email = normalizeEmail(g.email);
  const byEmail = await users().findOne({ email });
  if (byEmail) { await users().updateOne({ _id: byEmail._id }, { $set: { google_sub: g.sub } }); return toUser(toRow(byEmail)); }
  try { return await createUser({ name: g.name || email.split('@')[0]!, email, salt: randomSecret.salt, hash: randomSecret.hash, language: g.language, googleSub: g.sub }); }
  catch (e) {
    if (!isDuplicateKey(e)) throw e;
    const again = await users().findOne({ $or: [{ google_sub: g.sub }, { email }] });   // lost a race with a parallel sign-in
    if (!again) throw e;
    return toUser(toRow(again));
  }
}
