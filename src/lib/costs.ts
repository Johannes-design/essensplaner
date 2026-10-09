import "server-only";
import { hasRedis, hashToObject, pipeline } from "./redis";

const key = (householdId: string) => `kochfaul:costs:${householdId}`;
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

/** KI-Kosten (US-Cent) pro Haushalt und Monat mitschreiben – Grundlage für die Abrechnung. */
export async function recordCost(householdId: string, cents: number) {
  if (!hasRedis() || !(cents > 0)) return;
  try {
    await pipeline([["HINCRBYFLOAT", key(householdId), monthKey(), cents.toFixed(3)]]);
  } catch (e) {
    console.error("[costs]", e);
  }
}

export async function getCosts(householdIds: string[]): Promise<Record<string, Record<string, number>>> {
  if (!hasRedis() || !householdIds.length) return {};
  const res = await pipeline(householdIds.map((id) => ["HGETALL", key(id)]));
  const out: Record<string, Record<string, number>> = {};
  householdIds.forEach((id, i) => {
    out[id] = Object.fromEntries(Object.entries(hashToObject(res[i])).map(([m, v]) => [m, Number(v) || 0]));
  });
  return out;
}
