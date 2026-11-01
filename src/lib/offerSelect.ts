import type { Offer } from "./types";

const discount = (o: Offer) => (o.oldPrice ? (o.oldPrice - o.price) / o.oldPrice : 0);

/**
 * Auswahl für den KI-Prompt: alle Märkte gleichmäßig (reihum), innerhalb eines Marktes
 * zuerst reduzierte Angebote, Angebote nur mit Kundenkarte zuletzt.
 */
export function selectForPrompt(offers: Offer[], max = 300): Offer[] {
  if (offers.length <= max) return offers;
  const byStore = new Map<string, Offer[]>();
  for (const o of offers) byStore.set(o.store, [...(byStore.get(o.store) ?? []), o]);
  const queues = [...byStore.values()].map((list) =>
    [...list].sort((a, b) => Number(a.loyaltyRequired) - Number(b.loyaltyRequired) || discount(b) - discount(a)),
  );
  const out: Offer[] = [];
  for (let i = 0; out.length < max; i++) {
    let added = false;
    for (const q of queues) {
      if (i < q.length && out.length < max) {
        out.push(q[i]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}
