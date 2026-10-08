import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Der Haushalts-Code steht nicht im Klartext im Code, nur sein SHA-256-Hash.
// Eine Umgebungsvariable HOUSEHOLD_CODE hat Vorrang (zum Ändern ohne Code-Änderung).
const CODE_SHA256 = "ddb1369d147b442dd34d5a1b000084cdd96f70ca6535b8d6636fe676b6248955";

const normalize = (s: string) => s.trim().toLowerCase();
const sha = (s: string) => createHash("sha256").update(normalize(s)).digest();
const expectedHash = () => (process.env.HOUSEHOLD_CODE ? sha(process.env.HOUSEHOLD_CODE) : CODE_SHA256 ? Buffer.from(CODE_SHA256, "hex") : null);

export const codeRequired = () => !!expectedHash();

// Einfache Bremse gegen Durchprobieren: max. 10 Fehlversuche pro IP in 15 Minuten (pro Server-Instanz)
const failures = new Map<string, { n: number; since: number }>();
const WINDOW = 15 * 60 * 1000;
const ip = (r: Request) => r.headers.get("x-forwarded-for")?.split(",")[0].trim() || "?";

function blocked(r: Request) {
  const f = failures.get(ip(r));
  return !!f && Date.now() - f.since < WINDOW && f.n >= 10;
}
function noteFailure(r: Request) {
  const k = ip(r);
  const f = failures.get(k);
  if (!f || Date.now() - f.since > WINDOW) failures.set(k, { n: 1, since: Date.now() });
  else f.n++;
}

export function codeValid(request: Request): boolean {
  const expected = expectedHash();
  if (!expected) return true;
  const given = request.headers.get("x-household-code") ?? "";
  if (!given) return false;
  if (blocked(request)) return false;
  const ok = timingSafeEqual(sha(given), expected);
  if (!ok) noteFailure(request);
  return ok;
}

/** Gibt eine 401-Antwort zurück, wenn der Haushalts-Code fehlt oder falsch ist. */
export function requireCode(request: Request): Response | null {
  if (blocked(request)) return Response.json({ error: "Zu viele Fehlversuche – bitte später erneut versuchen" }, { status: 429 });
  return codeValid(request) ? null : Response.json({ error: "Haushalts-Code fehlt oder ist falsch" }, { status: 401 });
}
