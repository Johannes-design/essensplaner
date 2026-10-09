import "server-only";
import { hashToObject, pipeline } from "./redis";
import type { CookbookEntry, Plan, Profile } from "./types";

// Ein gemeinsamer Haushalt: Profil, Pläne, Häkchen der Einkaufsliste und Rezeptbuch.
// Der Haupt-Haushalt behält die ursprünglichen Schlüssel, weitere Haushalte bekommen einen eigenen Bereich.
function keys(householdId: string) {
  const pre = householdId === "main" ? "kochfaul:" : `kochfaul:hh:${householdId}:`;
  return {
    profile: `${pre}profile`,
    plans: `${pre}plans`,
    cookbook: `${pre}cookbook`,
    checked: (planId: string) => `${pre}checked:${planId}`,
  };
}
const MAX_PLANS = 20;

export type SyncOp =
  | { op: "setProfile"; profile: Profile }
  | { op: "putPlan"; plan: Plan }
  | { op: "deletePlan"; id: string }
  | { op: "check"; planId: string; itemId: string; on: boolean }
  | { op: "putRecipe"; entry: CookbookEntry }
  | { op: "deleteRecipe"; key: string };

export interface HouseholdData {
  profile: Profile | null;
  plans: Plan[];
  checked: Record<string, string[]>;
  cookbook: Record<string, CookbookEntry>;
}

const parse = <T>(s: unknown): T | null => {
  try {
    return typeof s === "string" ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

export async function loadHousehold(householdId: string): Promise<HouseholdData> {
  const K = keys(householdId);
  const [profileRaw, plansRaw, cookbookRaw] = await pipeline([["GET", K.profile], ["HGETALL", K.plans], ["HGETALL", K.cookbook]]);
  let plans = Object.values(hashToObject(plansRaw))
    .map((s) => parse<Plan>(s))
    .filter((p): p is Plan => !!p)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (plans.length > MAX_PLANS) {
    const old = plans.slice(MAX_PLANS);
    plans = plans.slice(0, MAX_PLANS);
    await pipeline(old.flatMap((p) => [["HDEL", K.plans, p.id], ["DEL", K.checked(p.id)]]));
  }
  const sets = await pipeline(plans.map((p) => ["SMEMBERS", K.checked(p.id)]));
  const checked: Record<string, string[]> = {};
  plans.forEach((p, i) => {
    const s = sets[i];
    if (Array.isArray(s) && s.length) checked[p.id] = s.map(String);
  });
  const cookbook: Record<string, CookbookEntry> = {};
  for (const [k, v] of Object.entries(hashToObject(cookbookRaw))) {
    const e = parse<CookbookEntry>(v);
    if (e) cookbook[k] = e;
  }
  return { profile: parse<Profile>(profileRaw), plans, checked, cookbook };
}

const str = (v: unknown, max = 200) => typeof v === "string" && v.length > 0 && v.length <= max;

export async function applyOps(householdId: string, ops: unknown[]): Promise<void> {
  const K = keys(householdId);
  const cmds: (string | number)[][] = [];
  for (const raw of ops) {
    const o = raw as SyncOp;
    switch (o?.op) {
      case "setProfile":
        if (o.profile && typeof o.profile === "object") cmds.push(["SET", K.profile, JSON.stringify(o.profile)]);
        break;
      case "putPlan":
        if (str(o.plan?.id) && str(o.plan?.createdAt)) cmds.push(["HSET", K.plans, o.plan.id, JSON.stringify(o.plan)]);
        break;
      case "deletePlan":
        if (str(o.id)) cmds.push(["HDEL", K.plans, o.id], ["DEL", K.checked(o.id)]);
        break;
      case "check":
        if (str(o.planId) && str(o.itemId)) cmds.push([o.on ? "SADD" : "SREM", K.checked(o.planId), o.itemId]);
        break;
      case "putRecipe":
        if (str(o.entry?.key, 400) && o.entry?.recipe) cmds.push(["HSET", K.cookbook, o.entry.key, JSON.stringify(o.entry)]);
        break;
      case "deleteRecipe":
        if (str(o.key, 400)) cmds.push(["HDEL", K.cookbook, o.key]);
        break;
    }
  }
  await pipeline(cmds);
}
