/**
 * App-scoped KV store client.
 *
 * Inside Cribl, `window.CRIBL_API_URL` exists and the platform proxies every fetch (auth is
 * injected by the shell). During `npm run dev` opened directly in a browser there is no
 * platform, so this module falls back to an in-memory store. The mock lets the UI be exercised
 * without credentials and never ships to production.
 *
 * The store holds plain text. A JSON string body is rejected (400) and a JSON object body is
 * stored as "[object Object]", so every value is sent as text/plain and parsed on the way back.
 * Values larger than roughly 100 KB are rejected with 413.
 */
import type { Card } from '../model/card';

declare global {
  interface Window {
    CRIBL_API_URL?: string;
    CRIBL_BASE_PATH?: string;
    CRIBL_APP_ID?: string;
    getCriblUser?: () => Promise<{ id: string; username: string; firstName?: string; lastName?: string }>;
  }
}

export const CARD_PREFIX = 'cards/';
export const API_KEY_KV = 'anthropicApiKey';
/** Documented ceiling for one stored value, with headroom under the platform's ~100 KB body limit. */
export const MAX_VALUE_BYTES = 96 * 1024;

export function isMockMode(): boolean {
  return import.meta.env.DEV && typeof window.CRIBL_API_URL !== 'string';
}

const mock = new Map<string, string>();

function base(): string {
  return window.CRIBL_API_URL ?? '/api/v1';
}

export class KvError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'KvError';
    this.status = status;
  }
}

function encode(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Parse a stored text value: JSON when it is JSON, otherwise the raw string. */
function decode<T>(text: string): T | undefined {
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function call(method: string, path: string, body?: string, contentType = 'text/plain'): Promise<string> {
  const res = await fetch(base() + path, {
    method,
    headers: body !== undefined ? { 'content-type': contentType, accept: '*/*' } : { accept: '*/*' },
    body,
  });
  const text = await res.text();
  if (res.status === 413) throw new KvError(413, 'That record is too large for the KV store (limit is about 100 KB).');
  if (!res.ok) throw new KvError(res.status, text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || res.statusText);
  return text;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (isMockMode()) {
    const v = mock.get(key);
    return v === undefined ? undefined : decode<T>(v);
  }
  try {
    return decode<T>(await call('GET', `/kvstore/${key}`));
  } catch (e) {
    if (e instanceof KvError && e.status === 404) return undefined;
    throw e;
  }
}

export async function kvPut(key: string, value: unknown): Promise<void> {
  const text = encode(value);
  if (text.length > MAX_VALUE_BYTES) throw new KvError(413, `That record is ${Math.round(text.length / 1024)} KB, over the KV store limit of ${MAX_VALUE_BYTES / 1024} KB.`);
  if (isMockMode()) {
    mock.set(key, text);
    return;
  }
  await call('PUT', `/kvstore/${key}`, text);
}

export async function kvDelete(key: string): Promise<void> {
  if (isMockMode()) {
    mock.delete(key);
    return;
  }
  try {
    await call('DELETE', `/kvstore/${key}`);
  } catch (e) {
    if (e instanceof KvError && e.status === 404) return;
    throw e;
  }
}

export async function kvKeys(prefix: string): Promise<string[]> {
  if (isMockMode()) return [...mock.keys()].filter((k) => k.startsWith(prefix));
  const data = decode<unknown>(await call('POST', '/kvstore/keys', JSON.stringify({ prefix }), 'application/json'));
  const raw = Array.isArray(data) ? data : ((data as { keys?: unknown[]; items?: unknown[] } | undefined)?.keys ?? (data as { items?: unknown[] } | undefined)?.items ?? []);
  return raw.map((k) => (typeof k === 'string' ? k : String((k as { key?: string }).key ?? ''))).filter(Boolean);
}

/** Read every entry under a prefix. Uses the paginated scan endpoint, falling back to key-by-key reads. */
export async function kvScan<T>(prefix: string): Promise<Array<{ key: string; value: T }>> {
  if (isMockMode()) {
    return [...mock.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .flatMap(([key, text]) => {
        const value = decode<T>(text);
        return value === undefined ? [] : [{ key, value }];
      });
  }
  try {
    const out: Array<{ key: string; value: T }> = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const body = JSON.stringify(cursor ? { prefix, cursor, limit: 500 } : { prefix, limit: 500 });
      const data = decode<{ items?: Array<{ key: string; value: unknown }>; nextCursor?: string }>(await call('POST', '/kvstore/scan', body, 'application/json'));
      for (const item of data?.items ?? []) {
        const value = typeof item.value === 'string' ? decode<T>(item.value) : (item.value as T);
        if (value !== undefined) out.push({ key: item.key, value });
      }
      cursor = data?.nextCursor;
      if (!cursor) break;
    }
    return out;
  } catch (e) {
    if (!(e instanceof KvError && (e.status === 404 || e.status === 405))) throw e;
  }
  const keys = await kvKeys(prefix);
  const values = await Promise.all(keys.map((k) => kvGet<T>(k)));
  return keys.flatMap((key, i) => (values[i] === undefined ? [] : [{ key, value: values[i] as T }]));
}

// ---- Cards ------------------------------------------------------------------------

export async function loadCards(): Promise<Card[]> {
  const entries = await kvScan<Card>(CARD_PREFIX);
  return entries
    .map((e) => e.value)
    .filter((c): c is Card => !!c && typeof c === 'object' && typeof c.name === 'string')
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
}

export async function saveCard(card: Card): Promise<void> {
  await kvPut(CARD_PREFIX + card.id, card);
}

export async function deleteCard(id: string): Promise<void> {
  await kvDelete(CARD_PREFIX + id);
}

// ---- Settings ---------------------------------------------------------------------

export async function hasApiKey(): Promise<boolean> {
  const v = await kvGet<string>(API_KEY_KV);
  return typeof v === 'string' && v.length > 0;
}

export async function setApiKey(key: string): Promise<void> {
  await kvPut(API_KEY_KV, key);
}

export async function clearApiKey(): Promise<void> {
  await kvDelete(API_KEY_KV);
}

export async function currentUser(): Promise<string> {
  try {
    const u = await window.getCriblUser?.();
    if (!u) return 'guest';
    return u.firstName ? `${u.firstName}${u.lastName ? ' ' + u.lastName : ''}` : u.username;
  } catch {
    return 'guest';
  }
}
