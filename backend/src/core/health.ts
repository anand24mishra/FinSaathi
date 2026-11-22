import { llmConfigured } from '../ai/llm';
import type { HealthStatus } from '../../../shared/contract';
import { config } from '../config';
import { storeHealthy } from '../store';

// Lightweight registry: any module can report how an upstream is doing; /v1/health reads it.
const registry = new Map<string, { ok: boolean; detail?: string; checkedAt: string }>();
const started = Date.now();

export function reportService(name: string, ok: boolean, detail?: string): void {
  registry.set(name, { ok, detail: detail?.slice(0, 200), checkedAt: new Date().toISOString() });
}

/** Run a market call; record success/failure in the registry; return fallback on error. */
export async function guarded<T>(service: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    const v = await fn();
    reportService(service, true);
    return v;
  } catch (e) {
    reportService(service, false, e instanceof Error ? e.message : String(e));
    return fallback;
  }
}

export function getHealth(): HealthStatus {
  const dbOk = storeHealthy();
  const services: HealthStatus['services'] = { db: { ok: dbOk, checkedAt: new Date().toISOString() } };
  for (const name of ['market', 'news', 'ipo', 'funds']) services[name] = registry.get(name) ?? { ok: true, detail: 'not checked yet' };
  for (const [k, v] of registry) if (!(k in services)) services[k] = v;
  return { ok: dbOk, time: new Date().toISOString(), uptimeSec: Math.round((Date.now() - started) / 1000), services, llm: llmConfigured() ? 'configured' : 'not-configured' };
}
