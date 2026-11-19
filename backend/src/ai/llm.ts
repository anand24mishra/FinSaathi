// Optional LLM access. Gemini is used when GEMINI_API_KEY is set, otherwise Anthropic when ANTHROPIC_API_KEY is set,
// otherwise the rules engine runs alone. Callers see one Anthropic-shaped interface either way.
// Per-process token cap, timeout, one retry. Any failure returns null and the caller falls back to rules.
import Anthropic from '@anthropic-ai/sdk';

export const LLM_MODEL = 'claude-sonnet-5-5';
const list = (v: string | undefined) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
/** Keys: GEMINI_API_KEYS (comma-separated) plus GEMINI_API_KEY. Models are tried in order: GEMINI_MODELS, else a built-in chain. */
export const geminiKeys = (): string[] => [...new Set([...list(process.env.GEMINI_API_KEYS), ...list(process.env.GEMINI_API_KEY)])];
export const geminiModels = (): string[] => {
  const m = list(process.env.GEMINI_MODELS ?? process.env.GEMINI_MODEL);
  return m.length ? m : ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3-flash-preview'];
};
export const geminiModel = (): string => geminiModels()[0];
let client: Anthropic | null = null;
let override: Pick<Anthropic, 'messages'> | null = null;
let used = 0;

const hasGemini = () => geminiKeys().length > 0;
export const llmProvider = (): 'gemini' | 'anthropic' | 'none' => (override ? 'anthropic' : hasGemini() ? 'gemini' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'none');
export const llmConfigured = (): boolean => llmProvider() !== 'none';
export const tokenCap = (): number => Number(process.env.FINSAATHI_LLM_TOKEN_CAP ?? process.env.ANAND_LLM_TOKEN_CAP ?? 300_000);
export const llmTokensUsed = () => used;
export const __setLlm = (c: Pick<Anthropic, 'messages'> | null) => { override = c; used = 0; };
export const __resetLlmUsage = () => { used = 0; };

function anthropic(): Pick<Anthropic, 'messages'> {
  if (override) return override;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 20_000, maxRetries: 0 });
  return client;
}

export type LlmParams = Omit<Anthropic.MessageCreateParamsNonStreaming, 'model' | 'stream'>;

// ---------- Gemini (REST, no SDK) ----------
type GPart = Record<string, unknown>;
const toolName = (id: string) => id.split('::')[0];

function toGeminiContents(messages: any[]): { role: 'user' | 'model'; parts: GPart[] }[] {
  return messages.map((m) => {
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (typeof m.content === 'string') return { role, parts: [{ text: m.content }] };
    const parts: GPart[] = [];
    for (const b of m.content as any[]) {
      if (b.type === 'text') parts.push({ text: b.text });
      else if (b.type === 'tool_use') parts.push({ functionCall: { name: b.name, args: b.input ?? {} }, ...(b.thought ? { thoughtSignature: b.thought } : {}) });
      else if (b.type === 'tool_result') parts.push({ functionResponse: { name: toolName(String(b.tool_use_id)), response: { result: String(b.content) } } });
    }
    return { role, parts: parts.length ? parts : [{ text: '' }] };
  });
}

// A (key, model) pair that failed recently is skipped for a while so one bad key or overloaded model never stalls requests.
const cooldown = new Map<string, number>();
const COOL_MS = { quota: 5 * 60_000, gone: 60 * 60_000, busy: 20_000 };

async function geminiOnce(key: string, model: string, body: unknown): Promise<any> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw Object.assign(new Error(`gemini ${res.status}`), { status: res.status });
  return res.json();
}

async function geminiCall(params: LlmParams): Promise<Anthropic.Message> {
  const tools = (params.tools as any[] | undefined)?.map((t) => ({
    name: t.name, description: t.description,
    ...(Object.keys(t.input_schema?.properties ?? {}).length ? { parameters: t.input_schema } : {}),
  }));
  const body = {
    ...(params.system ? { systemInstruction: { parts: [{ text: typeof params.system === 'string' ? params.system : JSON.stringify(params.system) }] } } : {}),
    contents: toGeminiContents(params.messages as any[]),
    ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}),
    generationConfig: { maxOutputTokens: Math.min(params.max_tokens ?? 800, 1200) * 3, temperature: 0.3 },
  };
  let j: any = null, usedModel = '';
  outer: for (const model of geminiModels()) {
    for (const key of geminiKeys()) {
      const id = `${key.slice(-6)}|${model}`;
      if ((cooldown.get(id) ?? 0) > Date.now()) continue;
      try { j = await geminiOnce(key, model, body); usedModel = model; break outer; }
      catch (e: any) {
        const st = e?.status;
        cooldown.set(id, Date.now() + (st === 429 ? COOL_MS.quota : st === 404 || st === 400 || st === 403 ? COOL_MS.gone : COOL_MS.busy));
      }
    }
  }
  if (!j) throw new Error('gemini: all keys/models failed');
  const parts: any[] = j?.candidates?.[0]?.content?.parts ?? [];
  const content: any[] = [];
  let n = 0;
  for (const p of parts) {
    if (p.functionCall) content.push({ type: 'tool_use', id: `${p.functionCall.name}::${n++}`, name: p.functionCall.name, input: p.functionCall.args ?? {}, ...(p.thoughtSignature ? { thought: p.thoughtSignature } : {}) });
    else if (typeof p.text === 'string' && !p.thought) content.push({ type: 'text', text: p.text });
  }
  if (!content.length) throw new Error('gemini empty');
  return {
    id: 'gemini', type: 'message', role: 'assistant', model: usedModel, content,
    stop_reason: content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn', stop_sequence: null,
    usage: { input_tokens: j?.usageMetadata?.promptTokenCount ?? 0, output_tokens: (j?.usageMetadata?.candidatesTokenCount ?? 0) + (j?.usageMetadata?.thoughtsTokenCount ?? 0) },
  } as unknown as Anthropic.Message;
}

/** Returns null when LLM is unavailable, over its cost cap, or failed twice (caller falls back to rules). */
export async function llmCall(params: LlmParams): Promise<Anthropic.Message | null> {
  if (!llmConfigured() || used >= tokenCap()) return null;
  const provider = llmProvider();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = provider === 'gemini'
        ? await geminiCall(params)
        : ((await anthropic().messages.create({ ...params, model: LLM_MODEL, max_tokens: Math.min(params.max_tokens ?? 800, 1200) })) as Anthropic.Message);
      used += (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0);
      return msg;
    } catch {
      if (attempt === 0 && provider === 'gemini') await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return null;
}
export const textOf = (m: Anthropic.Message): string => m.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n');
