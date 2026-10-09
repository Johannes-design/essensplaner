import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hasRedis, pipeline } from "./redis";

// Haupt-Haushalt (Johannes & Maxi): Code nur als SHA-256-Hash im Code.
// Eine Umgebungsvariable HOUSEHOLD_CODE hat Vorrang.
const MAIN_CODE_SHA256 = "ddb1369d147b442dd34d5a1b000084cdd96f70ca6535b8d6636fe676b6248955";
export const MAIN_HOUSEHOLD = "main";

const ACCOUNTS = "kochfaul:accounts";

export interface Account {
  key: string; // normalisierter Name
  name: string;
  householdId: string;
  salt: string;
  pinHash: string;
  createdAt: string;
}

export interface Auth {
  householdId: string;
  name: string;
  isAdmin: boolean;
}

const normalize = (s: string) => s.trim().toLowerCase();
const sha = (s: string) => createHash("sha256").update(s).digest();
export const nameKey = (name: string) =>
  normalize(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const mainHash = () => (process.env.HOUSEHOLD_CODE ? sha(normalize(process.env.HOUSEHOLD_CODE)) : Buffer.from(MAIN_CODE_SHA256, "hex"));
const pinHash = (salt: string, pin: string) => sha(`${salt}:${normalize(pin)}`).toString("hex");
const eq = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

// Bremse gegen Durchprobieren: max. 10 Fehlversuche pro IP in 15 Minuten (pro Server-Instanz)
const failures = new Map<string, { n: number; since: number }>();
const WINDOW = 15 * 60 * 1000;
const ip = (r: Request) => r.headers.get("x-forwarded-for")?.split(",")[0].trim() || "?";
const blocked = (r: Request) => {
  const f = failures.get(ip(r));
  return !!f && Date.now() - f.since < WINDOW && f.n >= 10;
};
function noteFailure(r: Request) {
  const k = ip(r);
  const f = failures.get(k);
  if (!f || Date.now() - f.since > WINDOW) failures.set(k, { n: 1, since: Date.now() });
  else f.n++;
}

export async function getAccount(name: string): Promise<Account | null> {
  if (!hasRedis()) return null;
  const [raw] = await pipeline([["HGET", ACCOUNTS, nameKey(name)]]);
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

export async function listAccounts(): Promise<Account[]> {
  if (!hasRedis()) return [];
  const [flat] = await pipeline([["HGETALL", ACCOUNTS]]);
  const out: Account[] = [];
  if (Array.isArray(flat))
    for (let i = 1; i < flat.length; i += 2) {
      try {
        out.push(JSON.parse(String(flat[i])));
      } catch {}
    }
  return out.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export async function createAccount(name: string, pin: string): Promise<Account> {
  const key = nameKey(name);
  if (!key) throw new Error("Bitte einen Namen angeben");
  if (!/^\d{4,8}$/.test(pin.trim())) throw new Error("Der Code muss aus 4 bis 8 Ziffern bestehen");
  if (await getAccount(name)) throw new Error("Diesen Namen gibt es schon");
  const salt = randomBytes(16).toString("hex");
  const acc: Account = { key, name: name.trim(), householdId: `u-${key}`, salt, pinHash: pinHash(salt, pin), createdAt: new Date().toISOString() };
  await pipeline([["HSET", ACCOUNTS, key, JSON.stringify(acc)]]);
  return acc;
}

export async function setAccountPin(name: string, pin: string) {
  const acc = await getAccount(name);
  if (!acc) throw new Error("Zugang nicht gefunden");
  if (!/^\d{4,8}$/.test(pin.trim())) throw new Error("Der Code muss aus 4 bis 8 Ziffern bestehen");
  const salt = randomBytes(16).toString("hex");
  await pipeline([["HSET", ACCOUNTS, acc.key, JSON.stringify({ ...acc, salt, pinHash: pinHash(salt, pin) })]]);
}

export async function deleteAccount(name: string) {
  await pipeline([["HDEL", ACCOUNTS, nameKey(name)]]);
}

/** Prüft Name + Code aus den Headern. Ohne Namen bzw. mit dem Haupt-Code: Haupt-Haushalt. */
export async function authenticate(request: Request): Promise<Auth | null> {
  if (blocked(request)) return null;
  const code = normalize(request.headers.get("x-household-code") ?? "");
  const name = decodeURIComponent(request.headers.get("x-household-name") ?? "").trim();
  if (!code) return null;
  if (eq(sha(code), mainHash())) return { householdId: MAIN_HOUSEHOLD, name: name || "Haushalt", isAdmin: true };
  if (name) {
    const acc = await getAccount(name).catch(() => null);
    if (acc && eq(Buffer.from(pinHash(acc.salt, code), "hex"), Buffer.from(acc.pinHash, "hex"))) {
      return { householdId: acc.householdId, name: acc.name, isAdmin: false };
    }
  }
  noteFailure(request);
  return null;
}

/** Für API-Routen: gibt entweder die Anmeldung oder eine Fehlerantwort zurück. */
export async function requireAuth(request: Request): Promise<Auth | Response> {
  if (blocked(request)) return Response.json({ error: "Zu viele Fehlversuche – bitte später erneut versuchen" }, { status: 429 });
  const auth = await authenticate(request);
  return auth ?? Response.json({ error: "Name oder Code falsch" }, { status: 401 });
}
