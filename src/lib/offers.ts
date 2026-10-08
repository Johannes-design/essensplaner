import "server-only";
import { STORES } from "./constants";
import type { Offer } from "./types";

// Suchbegriffe, mit denen die Prospekt-Angebote eingesammelt werden.
// marktguru bündelt die Prospekte aller Märkte pro Postleitzahl.
const SEARCH_TERMS = [
  "hackfleisch", "hähnchen", "hähnchenbrust", "putenbrust", "schweinefleisch", "schnitzel", "rindfleisch",
  "bratwurst", "wiener", "aufschnitt", "schinken", "speck", "lachs", "fischstäbchen", "seelachs", "thunfisch",
  "eier", "milch", "butter", "sahne", "käse", "mozzarella", "feta", "joghurt", "quark", "frischkäse", "schmand",
  "nudeln", "spaghetti", "reis", "kartoffeln", "gnocchi", "brot", "toast", "brötchen", "wraps", "mehl",
  "tomaten", "paprika", "gurke", "zwiebeln", "möhren", "brokkoli", "zucchini", "champignons", "salat",
  "blumenkohl", "porree", "kohlrabi", "spinat", "äpfel", "bananen", "trauben", "beeren", "zitronen",
  "passierte tomaten", "kokosmilch", "kidneybohnen", "mais", "linsen", "kichererbsen", "pesto", "ketchup",
  "tiefkühlgemüse", "pizza", "pommes", "tofu", "margarine", "öl",
];

const API = "https://api.marktguru.de/api/v1";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

interface MgAdvertiser { uniqueName: string; name: string }
interface MgOffer {
  id: number;
  description: string | null;
  price: number;
  oldPrice: number | null;
  referencePrice: number | null;
  requiresLoyalityMembership: boolean;
  advertisers: MgAdvertiser[];
  validityDates: { from: string; to: string }[];
  brand?: { name: string } | null;
  product?: { name: string } | null;
  unit?: { shortName: string } | null;
  quantity?: number | null;
  volume?: number | null;
}

type CacheEntry = { at: number; offers: Offer[] };
const cache = new Map<string, CacheEntry>();
const TTL = 6 * 60 * 60 * 1000;

let keys: { apiKey: string; clientKey: string; at: number } | null = null;

async function getKeys() {
  if (keys && Date.now() - keys.at < TTL) return keys;
  const res = await fetch("https://www.marktguru.de/", { headers: { "user-agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`marktguru.de antwortet mit ${res.status}`);
  const html = await res.text();
  const re = /<script\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const json = JSON.parse(m[1]);
      const cfg = json?.config ?? json;
      if (cfg?.apiKey && cfg?.clientKey) {
        keys = { apiKey: cfg.apiKey, clientKey: cfg.clientKey, at: Date.now() };
        return keys;
      }
    } catch {
      // nächstes Script-Tag probieren
    }
  }
  // Fallback: Schlüssel irgendwo im HTML suchen
  const a = html.match(/"apiKey"\s*:\s*"([^"]+)"/);
  const c = html.match(/"clientKey"\s*:\s*"([^"]+)"/);
  if (a && c) {
    keys = { apiKey: a[1], clientKey: c[1], at: Date.now() };
    return keys;
  }
  throw new Error("API-Schlüssel von marktguru nicht gefunden");
}

function storeKeyFor(uniqueName: string): string | null {
  const u = uniqueName.toLowerCase();
  // "netto-marken-discount" vor "netto" prüfen ist durch die Reihenfolge in STORES gegeben
  for (const s of STORES) if (s.match.some((m) => u === m || u.startsWith(m))) return s.key;
  return null;
}

function fmtUnit(o: MgOffer): string | null {
  const unit = o.unit?.shortName;
  const vol = o.volume ?? o.quantity;
  if (unit && vol) return `${vol} ${unit}`;
  return unit ?? null;
}

function overlaps(o: MgOffer, from: Date, to: Date) {
  if (!o.validityDates?.length) return true;
  return o.validityDates.some((d) => new Date(d.from) <= to && new Date(d.to) >= from);
}

async function searchTerm(term: string, zip: string, k: { apiKey: string; clientKey: string }): Promise<MgOffer[]> {
  const url = `${API}/offers/search?as=web&limit=60&offset=0&q=${encodeURIComponent(term)}&zipCode=${encodeURIComponent(zip)}`;
  const res = await fetch(url, {
    headers: { "x-apikey": k.apiKey, "x-clientkey": k.clientKey, "user-agent": UA, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`marktguru Suche "${term}": ${res.status}`);
  const data = await res.json();
  return (data?.results ?? []) as MgOffer[];
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          out[idx] = { status: "fulfilled", value: await fn(items[idx]) };
        } catch (e) {
          out[idx] = { status: "rejected", reason: e };
        }
      }
    }),
  );
  return out;
}

/** Holt alle aktuellen Lebensmittel-Angebote für eine PLZ (gecacht für 6 Stunden). */
export async function fetchMarktguruOffers(zip: string, weekStart?: string): Promise<Offer[]> {
  const from = weekStart ? new Date(weekStart) : new Date();
  const to = new Date(from.getTime() + 6 * 86400000);
  const cacheKey = `${zip}:${from.toISOString().slice(0, 10)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.offers;

  const k = await getKeys();
  const results = await pool(SEARCH_TERMS, 6, (t) => searchTerm(t, zip, k));
  const failures = results.filter((r) => r.status === "rejected").length;
  if (failures === results.length) {
    keys = null; // Schlüssel evtl. abgelaufen
    throw new Error("Alle Angebotsabfragen sind fehlgeschlagen");
  }

  const seen = new Map<string, Offer>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const o of r.value) {
      if (!overlaps(o, from, to) || typeof o.price !== "number" || o.price <= 0) continue;
      const adv = o.advertisers?.map((a) => ({ a, key: storeKeyFor(a.uniqueName) })).find((x) => x.key);
      if (!adv?.key) continue;
      const id = `mg-${o.id}-${adv.key}`;
      if (seen.has(id)) continue;
      const product = [o.product?.name, o.description && !o.product?.name ? o.description : null].filter(Boolean).join(" ") || "Angebot";
      seen.set(id, {
        id,
        store: adv.key,
        storeName: STORES.find((s) => s.key === adv.key)!.name,
        product,
        brand: o.brand?.name ?? null,
        description: o.description ? o.description.slice(0, 140) : null,
        price: o.price,
        oldPrice: o.oldPrice && o.oldPrice > o.price ? o.oldPrice : null,
        unit: fmtUnit(o),
        referencePrice: o.referencePrice ? `${o.referencePrice.toFixed(2).replace(".", ",")} €/${o.unit?.shortName === "g" ? "kg" : o.unit?.shortName === "ml" ? "l" : "Einheit"}` : null,
        validFrom: o.validityDates?.[0]?.from ?? null,
        validTo: o.validityDates?.[0]?.to ?? null,
        loyaltyRequired: !!o.requiresLoyalityMembership,
        imageUrl: `https://mg2de.b-cdn.net/api/v1/offers/${o.id}/images/default/0/small.jpg`,
        source: "marktguru",
      });
    }
  }
  const offers = [...seen.values()].sort((a, b) => a.store.localeCompare(b.store) || a.price - b.price);
  cache.set(cacheKey, { at: Date.now(), offers });
  return offers;
}

/** Kompakte Darstellung für den KI-Prompt: eine Zeile pro Angebot. */
export function offersToPromptLines(offers: Offer[]): string {
  return offers
    .map((o) => {
      const parts = [
        o.id,
        o.storeName,
        [o.brand, o.product].filter(Boolean).join(" "),
        o.unit ?? "",
        `${o.price.toFixed(2)} €`,
        o.oldPrice ? `statt ${o.oldPrice.toFixed(2)} €` : "",
        o.referencePrice ?? "",
        o.loyaltyRequired ? "nur mit App/Karte" : "",
      ];
      return parts.filter(Boolean).join(" | ");
    })
    .join("\n");
}
