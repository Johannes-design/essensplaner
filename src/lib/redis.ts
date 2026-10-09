import "server-only";

// Minimaler Client für Upstash Redis (REST). Vercel setzt KV_REST_API_* bzw. UPSTASH_REDIS_REST_*,
// wenn eine Redis-Datenbank mit dem Projekt verbunden wird.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MOCK = process.env.REDIS_MOCK === "1";

export const hasRedis = () => MOCK || !!(URL_ && TOKEN);

type Cmd = (string | number)[];

export async function pipeline(cmds: Cmd[]): Promise<unknown[]> {
  if (!cmds.length) return [];
  if (MOCK) return cmds.map(mockExec);
  const res = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmds.map((c) => c.map(String))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${await res.text().catch(() => "")}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  const err = out.find((r) => r.error);
  if (err) throw new Error(`Redis: ${err.error}`);
  return out.map((r) => r.result);
}

/** HGETALL liefert [feld, wert, feld, wert, …] */
export function hashToObject(flat: unknown): Record<string, string> {
  const o: Record<string, string> = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) o[String(flat[i])] = String(flat[i + 1]);
  return o;
}

// ---- In-Memory-Ersatz für lokale Tests (REDIS_MOCK=1) ----
const g = globalThis as unknown as { __mockRedis?: Map<string, unknown> };
const db = (g.__mockRedis ??= new Map<string, unknown>());

function mockExec(c: Cmd): unknown {
  const [op, key, ...a] = c.map(String);
  const hash = () => (db.get(key) as Map<string, string>) ?? new Map<string, string>();
  const set = () => (db.get(key) as Set<string>) ?? new Set<string>();
  switch (op.toUpperCase()) {
    case "GET":
      return (db.get(key) as string) ?? null;
    case "SET":
      db.set(key, a[0]);
      return "OK";
    case "DEL":
      return db.delete(key) ? 1 : 0;
    case "HSET": {
      const h = hash();
      for (let i = 0; i + 1 < a.length; i += 2) h.set(a[i], a[i + 1]);
      db.set(key, h);
      return 1;
    }
    case "HDEL": {
      const h = hash();
      a.forEach((f) => h.delete(f));
      db.set(key, h);
      return 1;
    }
    case "HGET":
      return hash().get(a[0]) ?? null;
    case "HINCRBYFLOAT": {
      const h = hash();
      const v = (Number(h.get(a[0]) ?? 0) + Number(a[1])).toString();
      h.set(a[0], v);
      db.set(key, h);
      return v;
    }
    case "HGETALL":
      return [...hash()].flat();
    case "SADD": {
      const s = set();
      a.forEach((m) => s.add(m));
      db.set(key, s);
      return 1;
    }
    case "SREM": {
      const s = set();
      a.forEach((m) => s.delete(m));
      db.set(key, s);
      return 1;
    }
    case "SMEMBERS":
      return [...set()];
    default:
      throw new Error(`Mock: ${op} nicht unterstützt`);
  }
}
