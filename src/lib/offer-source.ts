import "server-only";
import { hasApiKey, searchOffersOnWeb } from "./ai";
import { DEMO_OFFERS } from "./demo";
import { fetchMarktguruOffers } from "./offers";
import type { Offer, Plan } from "./types";

export const isDemo = () => process.env.DEMO_MODE === "1";

export interface OfferResult {
  offers: Offer[];
  source: Plan["offerSource"];
  note: string;
}

/** Angebote holen: 1. Prospektdaten (marktguru), 2. KI-Websuche, 3. ohne Angebote. */
export async function loadOffers(zip: string, stores: string[], weekStart: string, opts: { allowWebSearch: boolean }): Promise<OfferResult> {
  if (isDemo()) return { offers: DEMO_OFFERS.filter((o) => stores.includes(o.store)), source: "demo", note: "Demo-Daten" };
  let error = "";
  try {
    const all = await fetchMarktguruOffers(zip, weekStart);
    const offers = all.filter((o) => stores.includes(o.store));
    if (offers.length >= 15) return { offers, source: "marktguru", note: "aus den aktuellen Prospekten" };
    error = `nur ${offers.length} Angebote gefunden`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  console.warn("[offers] Prospektdaten nicht verfügbar:", error);
  if (opts.allowWebSearch && hasApiKey()) {
    try {
      const offers = await searchOffersOnWeb(zip, stores, weekStart);
      if (offers.length) return { offers, source: "websuche", note: "per Websuche gefunden, Preise bitte im Laden prüfen" };
    } catch (e) {
      console.warn("[offers] Websuche fehlgeschlagen:", e);
    }
  }
  return { offers: [], source: "keine", note: `keine Angebote verfügbar (${error})` };
}

/** Für den Prompt: Angebote mit Rabatt zuerst, Liste begrenzen. */
export function selectForPrompt(offers: Offer[], max = 200): Offer[] {
  if (offers.length <= max) return offers;
  const discount = (o: Offer) => (o.oldPrice ? (o.oldPrice - o.price) / o.oldPrice : 0);
  return [...offers].sort((a, b) => discount(b) - discount(a)).slice(0, max);
}
