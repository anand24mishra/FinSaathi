// MongoDB (Atlas free tier) persistence. Render's free disk is wiped on every deploy/restart, so accounts and portfolios live here.
// One shared client for the process. Documents use our own string ids as _id.
import { MongoClient, type Collection, type Db } from 'mongodb';
import type { ChatMessage, Profile } from '../../shared/contract';

export interface UserDoc {
  _id: string; name: string; email: string; pw_salt: string; pw_hash: string; profile: Profile;
  push_token?: string | null; push_platform?: string | null; google_sub?: string | null; created_at: string; last_active_at: string;
}
export interface HoldingDoc {
  _id: string; user_id: string; type: 'stock' | 'fund'; symbol: string | null; scheme_code: number | null; name: string;
  quantity: number; avg_price: number; buy_date: string | null; created_at: string;
}
export interface AlertDoc {
  _id: string; user_id: string; dedupe_key: string; kind: string; severity: string; title: unknown; body: unknown; created_at: string; read: boolean; pushed: boolean;
}
export interface ConversationDoc { _id: string; user_id: string; title: string; created_at: string; updated_at: string; messages: ChatMessage[] }
export interface TelegramLinkDoc { _id: string; chat_id: string; linked_at: string }            // _id = user id
export interface TelegramCodeDoc { _id: string; user_id: string; expires_at: number; created_at: string }   // _id = sha256(code)

let client: MongoClient | null = null;
let db: Db | null = null;
let healthy = false;

export async function initStore(uri: string | undefined = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB || 'finsaathi'): Promise<Db> {
  if (db) return db;
  if (!uri) throw new Error('MONGODB_URI is not set. Create a free MongoDB Atlas cluster and put its connection string in backend/.env.');
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000, maxPoolSize: 10 });
  await client.connect();
  db = client.db(dbName);
  await Promise.all([
    users().createIndex({ email: 1 }, { unique: true }),
    users().createIndex({ google_sub: 1 }, { unique: true, partialFilterExpression: { google_sub: { $type: 'string' } } }),
    users().createIndex({ last_active_at: 1 }),
    holdings().createIndex({ user_id: 1, created_at: 1 }),
    alerts().createIndex({ user_id: 1, dedupe_key: 1 }, { unique: true }),
    alerts().createIndex({ user_id: 1, created_at: -1 }),
    conversations().createIndex({ user_id: 1, updated_at: -1 }),
    telegramLinks().createIndex({ chat_id: 1 }, { unique: true }),
    telegramCodes().createIndex({ user_id: 1 }),
  ]);
  healthy = true;
  return db;
}
export async function closeStore(): Promise<void> {
  healthy = false;
  try { await client?.close(); } catch { /* ignore */ }
  client = null; db = null;
}
const need = (): Db => { if (!db) throw new Error('Store is not initialised; call initStore() first.'); return db; };
export const users = (): Collection<UserDoc> => need().collection<UserDoc>('users');
export const holdings = (): Collection<HoldingDoc> => need().collection<HoldingDoc>('holdings');
export const alerts = (): Collection<AlertDoc> => need().collection<AlertDoc>('alerts');
export const conversations = (): Collection<ConversationDoc> => need().collection<ConversationDoc>('conversations');
export const telegramLinks = (): Collection<TelegramLinkDoc> => need().collection<TelegramLinkDoc>('telegram_links');
export const telegramCodes = (): Collection<TelegramCodeDoc> => need().collection<TelegramCodeDoc>('telegram_link_codes');

/** Last known state, refreshed by pingStore(); health checks stay synchronous. */
export const storeHealthy = (): boolean => healthy;
export async function pingStore(): Promise<boolean> {
  try { await need().command({ ping: 1 }); healthy = true; } catch { healthy = false; }
  return healthy;
}
export const isDuplicateKey = (e: unknown): boolean => (e as { code?: number })?.code === 11000;
