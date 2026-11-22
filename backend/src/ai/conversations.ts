// Saved chats, ChatGPT-style: one document per conversation, kept on the server so they follow the user to any device.
import { randomUUID } from 'node:crypto';
import type { ChatMessage, Conversation, ConversationSummary } from '../../../shared/contract';
import { conversations, type ConversationDoc } from '../store';

const MAX_MESSAGES = 200;
const MAX_CONVERSATIONS = 200;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const titleFrom = (text: string) => clip(text.replace(/\s+/g, ' ').trim(), 50) || 'New chat';
const toConv = (d: ConversationDoc): Conversation => ({ id: d._id, title: d.title, createdAt: d.created_at, updatedAt: d.updated_at, messages: d.messages });

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const rows = await conversations().find({ user_id: userId }, { projection: { messages: { $slice: -1 }, title: 1, updated_at: 1 } }).sort({ updated_at: -1 }).limit(MAX_CONVERSATIONS).toArray();
  return rows.map((d) => ({ id: d._id, title: d.title, updatedAt: d.updated_at, preview: clip(d.messages?.[0]?.text ?? '', 80) }));
}

export async function getConversation(userId: string, id: string): Promise<Conversation | null> {
  const d = await conversations().findOne({ _id: id, user_id: userId });
  return d ? toConv(d) : null;
}

/** Recent turns used as model context (the server copy is trusted; the client never has to send history). */
export async function recentHistory(userId: string, id: string, n = 12): Promise<{ role: 'user' | 'assistant'; text: string }[]> {
  const d = await conversations().findOne({ _id: id, user_id: userId }, { projection: { messages: { $slice: -n } } });
  return (d?.messages ?? []).filter((m) => !m.refused).map((m) => ({ role: m.role, text: m.text }));
}

/** Appends a user/assistant turn, creating the conversation when `id` is missing or unknown. Returns the conversation id. */
export async function appendTurn(userId: string, id: string | null | undefined, user: ChatMessage, assistant: ChatMessage): Promise<string> {
  const now = new Date().toISOString();
  if (id) {
    const r = await conversations().updateOne(
      { _id: id, user_id: userId },
      { $push: { messages: { $each: [user, assistant], $slice: -MAX_MESSAGES } }, $set: { updated_at: now } },
    );
    if (r.matchedCount) return id;
  }
  const newId = randomUUID();
  await conversations().insertOne({ _id: newId, user_id: userId, title: titleFrom(user.text), created_at: now, updated_at: now, messages: [user, assistant] });
  return newId;
}

export async function renameConversation(userId: string, id: string, title: string): Promise<boolean> {
  const r = await conversations().updateOne({ _id: id, user_id: userId }, { $set: { title: titleFrom(title) } });
  return r.matchedCount > 0;
}

export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  const r = await conversations().deleteOne({ _id: id, user_id: userId });
  return r.deletedCount > 0;
}

/** One-time upload of the chat that used to live only on the phone. Skipped when the user already has conversations. */
export async function importLocal(userId: string, msgs: { role: 'user' | 'assistant'; text: string }[]): Promise<string | null> {
  if (await conversations().countDocuments({ user_id: userId }, { limit: 1 })) return null;
  const clean = msgs.filter((m) => m.text?.trim()).slice(-MAX_MESSAGES);
  const first = clean.find((m) => m.role === 'user');
  if (!first) return null;
  const now = new Date().toISOString();
  const id = randomUUID();
  const messages: ChatMessage[] = clean.map((m, i) => ({ id: `${id}-${i}`, role: m.role, text: m.text.slice(0, 4000), at: now }));
  await conversations().insertOne({ _id: id, user_id: userId, title: titleFrom(first.text), created_at: now, updated_at: now, messages });
  return id;
}
