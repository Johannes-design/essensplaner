import "server-only";
import { timingSafeEqual } from "node:crypto";

export const codeRequired = () => !!process.env.HOUSEHOLD_CODE;

export function codeValid(request: Request): boolean {
  const expected = process.env.HOUSEHOLD_CODE;
  if (!expected) return true;
  const given = request.headers.get("x-household-code") ?? "";
  const a = Buffer.from(given.trim().toLowerCase());
  const b = Buffer.from(expected.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Gibt eine 401-Antwort zurück, wenn der Haushalts-Code fehlt oder falsch ist. */
export function requireCode(request: Request): Response | null {
  return codeValid(request) ? null : Response.json({ error: "Haushalts-Code fehlt oder ist falsch" }, { status: 401 });
}
