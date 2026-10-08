"use client";
import { getStored, setWriteHook, writeLocal, type StoreKeys } from "./store";
import type { CookbookEntry, Plan } from "./types";

const CODE_KEY = "essensplaner:code";
const QUEUE_KEY = "essensplaner:pendingOps";

export function getCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}
export function setCode(code: string) {
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {}
}

/** fetch mit Haushalts-Code. Bei 401 wird die Code-Abfrage wieder angezeigt. */
export async function apiFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-household-code", getCode());
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) window.dispatchEvent(new Event("household:locked"));
  return res;
}

// ---------- Änderungen als Einzel-Operationen ----------
type Op =
  | { op: "setProfile"; profile: unknown }
  | { op: "putPlan"; plan: Plan }
  | { op: "deletePlan"; id: string }
  | { op: "check"; planId: string; itemId: string; on: boolean }
  | { op: "putRecipe"; entry: CookbookEntry }
  | { op: "deleteRecipe"; key: string };

function diff<K extends keyof StoreKeys>(key: K, before: StoreKeys[K], after: StoreKeys[K]): Op[] {
  const ops: Op[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (key === "profile") {
    if (after && !same(before, after)) ops.push({ op: "setProfile", profile: after });
  } else if (key === "plans") {
    const b = new Map((before as Plan[]).map((p) => [p.id, p]));
    const a = new Map((after as Plan[]).map((p) => [p.id, p]));
    for (const [id, p] of a) if (!same(b.get(id), p)) ops.push({ op: "putPlan", plan: p });
    for (const id of b.keys()) if (!a.has(id)) ops.push({ op: "deletePlan", id });
  } else if (key === "checked") {
    const b = before as Record<string, string[]>;
    const a = after as Record<string, string[]>;
    for (const planId of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const sb = new Set(b[planId] ?? []);
      const sa = new Set(a[planId] ?? []);
      for (const itemId of sa) if (!sb.has(itemId)) ops.push({ op: "check", planId, itemId, on: true });
      for (const itemId of sb) if (!sa.has(itemId)) ops.push({ op: "check", planId, itemId, on: false });
    }
  } else if (key === "cookbook") {
    const b = before as Record<string, CookbookEntry>;
    const a = after as Record<string, CookbookEntry>;
    for (const [k, e] of Object.entries(a)) if (!same(b[k], e)) ops.push({ op: "putRecipe", entry: e });
    for (const k of Object.keys(b)) if (!(k in a)) ops.push({ op: "deleteRecipe", key: k });
  }
  return ops;
}

function queue(): Op[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveQueue(q: Op[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {}
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<boolean> | null = null;

async function flush(): Promise<boolean> {
  if (flushing) return flushing;
  const run = (async () => {
    const q = queue();
    if (!q.length) return true;
    try {
      const res = await apiFetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops: q }) });
      if (!res.ok) return false;
      // Nur die gesendeten Ops entfernen – inzwischen neu hinzugekommene bleiben
      saveQueue(queue().slice(q.length));
      return true;
    } catch {
      return false;
    }
  })();
  flushing = run;
  try {
    return await run;
  } finally {
    if (flushing === run) flushing = null;
  }
}

function enqueue(ops: Op[]) {
  if (ops.length) saveQueue([...queue(), ...ops]);
  if (!queue().length) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(async () => {
    if ((await flush()) && queue().length) enqueue([]);
  }, 300);
}

/** Holt den Stand vom Server. Lokale, noch nicht gesendete Änderungen werden vorher übertragen. */
export async function pull(): Promise<boolean> {
  if (!(await flush())) return false;
  if (queue().length) return false;
  try {
    const res = await apiFetch("/api/sync", { cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as StoreKeys;
    // Während des Ladens neu entstandene Änderungen nicht überschreiben
    if (queue().length) return false;
    if (!data.profile && getStored("profile")) {
      // Erstes Gerät: vorhandene lokale Daten hochladen
      uploadAll();
      return true;
    }
    writeLocal("profile", data.profile);
    writeLocal("plans", data.plans);
    writeLocal("checked", data.checked);
    writeLocal("cookbook", data.cookbook);
    return true;
  } catch {
    return false;
  }
}

function uploadAll() {
  const ops: Op[] = [];
  const profile = getStored("profile");
  if (profile) ops.push({ op: "setProfile", profile });
  ops.push(...diff("plans", [], getStored("plans")));
  ops.push(...diff("checked", {}, getStored("checked")));
  ops.push(...diff("cookbook", {}, getStored("cookbook")));
  enqueue(ops);
}

let started = false;
/** Startet die Synchronisierung: erst laden, dann bei jeder Rückkehr in die App und alle 20 s. */
export async function startSync(): Promise<boolean> {
  setWriteHook((key, before, after) => enqueue(diff(key, before, after)));
  const ok = await pull();
  if (!started) {
    started = true;
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void pull());
    window.addEventListener("online", () => void pull());
    setInterval(() => document.visibilityState === "visible" && void pull(), 20000);
  }
  return ok;
}
