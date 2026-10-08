"use client";
import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_PANTRY, STORES } from "./constants";
import type { CookbookEntry, Plan, Profile } from "./types";

export const DEFAULT_PROFILE: Profile = {
  name: "",
  persons: 2,
  zipCode: "18435",
  stores: STORES.map((s) => s.key),
  diet: "alles",
  allergies: [],
  otherIntolerances: "",
  likes: [],
  dislikes: [],
  favoriteDishes: [],
  maxCookMinutes: 30,
  equipment: ["Backofen", "Mikrowelle"],
  pantry: DEFAULT_PANTRY,
  leftoversForLunch: true,
};

type Keys = {
  profile: Profile | null;
  plans: Plan[];
  checked: Record<string, string[]>; // planId -> ShoppingItem-IDs
  cookbook: Record<string, CookbookEntry>; // dishKey -> Rezept
};
const DEFAULTS: Keys = { profile: null, plans: [], checked: {}, cookbook: {} };
const PREFIX = "essensplaner:";

const listeners = new Set<() => void>();
const memo = new Map<string, { raw: string | null; value: unknown }>();

function read<K extends keyof Keys>(key: K): Keys[K] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFIX + key);
  } catch {
    raw = null;
  }
  const m = memo.get(key);
  if (m && m.raw === raw) return m.value as Keys[K];
  let value: Keys[K] = DEFAULTS[key];
  if (raw) {
    try {
      value = JSON.parse(raw);
    } catch {
      value = DEFAULTS[key];
    }
  }
  if (key === "profile" && value) value = { ...DEFAULT_PROFILE, ...(value as Profile) } as Keys[K];
  memo.set(key, { raw, value });
  return value;
}

let persistAsked = false;

export function write<K extends keyof Keys>(key: K, value: Keys[K]) {
  // Browser bitten, die Daten dauerhaft zu behalten (nicht bei Speicherknappheit löschen)
  if (!persistAsked) {
    persistAsked = true;
    navigator.storage?.persist?.().catch(() => {});
  }
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error("Speichern fehlgeschlagen", e);
    alert("Speichern fehlgeschlagen – ist der Speicher voll?");
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key?.startsWith(PREFIX) && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Liest einen Wert aus dem Gerätespeicher. `undefined` = noch nicht geladen (Server-Render). */
export function useStored<K extends keyof Keys>(key: K): [Keys[K] | undefined, (v: Keys[K]) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => undefined,
  );
  const set = useCallback((v: Keys[K]) => write(key, v), [key]);
  return [value, set];
}

export function getStored<K extends keyof Keys>(key: K): Keys[K] {
  return read(key);
}

export function exportAll(): string {
  const data: Partial<Keys> = {};
  (Object.keys(DEFAULTS) as (keyof Keys)[]).forEach((k) => ((data as Record<string, unknown>)[k] = read(k)));
  return JSON.stringify({ app: "essensplaner", version: 1, data }, null, 2);
}

export function importAll(json: string) {
  const parsed = JSON.parse(json);
  if (parsed?.app !== "essensplaner" || !parsed.data) throw new Error("Keine gültige Sicherungsdatei");
  (Object.keys(DEFAULTS) as (keyof Keys)[]).forEach((k) => {
    if (k in parsed.data) write(k, parsed.data[k]);
  });
}

export const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function dayDate(weekStart: string, i: number) {
  const [y, m, d] = weekStart.split("-").map(Number);
  const x = new Date(y, m - 1, d + i);
  return x.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" });
}

/** Schlüssel fürs Rezeptbuch: gleicher Name + gleiche Portionen = gleiches Rezept. */
export function dishKey(name: string, servings: number) {
  const n = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${n}|${servings}`;
}

export function findInCookbook(cookbook: Record<string, CookbookEntry> | undefined, name: string, servings: number) {
  if (!cookbook) return undefined;
  return cookbook[dishKey(name, servings)];
}

/** Namen fürs KI-Prompt: oft genutzte zuerst. */
export function cookbookDishNames(cookbook: Record<string, CookbookEntry>) {
  return Object.values(cookbook)
    .sort((a, b) => b.uses - a.uses || b.savedAt.localeCompare(a.savedAt))
    .map((e) => e.name);
}
