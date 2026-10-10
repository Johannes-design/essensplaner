import type { Offer } from "./types";

/** Gilt das Angebot am Einkaufstag? (Mittag des Tages, damit Zeitzonen egal sind) */
export function validOn(o: Offer, day: string): boolean {
  const periods = o.periods?.length ? o.periods : o.validFrom && o.validTo ? [{ from: o.validFrom, to: o.validTo }] : [];
  if (!periods.length) return true;
  const t = new Date(`${day}T12:00:00Z`).getTime();
  return periods.some((p) => new Date(p.from).getTime() <= t && new Date(p.to).getTime() >= t);
}

export function filterForDay(offers: Offer[], day: string) {
  return offers.filter((o) => validOn(o, day));
}
