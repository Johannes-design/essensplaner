// Schnelltest der Prüflogik: npx tsx scripts/check-logic.ts
import assert from "node:assert/strict";
import { findAllergens } from "../src/lib/allergens";
import { postprocess } from "../src/lib/postprocess";
import { DEMO_OFFERS, demoPlan } from "../src/lib/demo";
import { DEFAULT_PANTRY } from "../src/lib/constants";
import type { PlanRequest } from "../src/lib/types";

const t = (text: string, keys: string[], expected: number) => {
  const r = findAllergens(text, keys);
  assert.equal(r.length, expected, `${text} [${keys}] -> ${JSON.stringify(r)}`);
};
t("Schweinefilet", ["sulfite"], 0);
t("Rotwein", ["sulfite"], 1);
t("Kartoffelbrei", ["ei"], 0);
t("2 Eier", ["ei"], 2 - 1);
t("1 Ei", ["ei"], 1);
t("Reis", ["ei"], 0);
t("Laktosefreie Milch", ["laktose"], 0);
t("Milch 3,5 %", ["laktose"], 1);
t("Hafermilch", ["laktose"], 0);
t("Spaghetti", ["gluten"], 1);
t("Glutenfreie Spaghetti", ["gluten"], 0);
t("Basilikum-Pesto", ["nuesse"], 1);
t("Muskatnuss", ["nuesse"], 0);
t("Weizentortilla", ["gluten"], 1);
t("Lachsfilet", ["fisch"], 1);
t("Gouda gerieben", ["laktose", "histamin"], 2);

const req: PlanRequest = {
  profile: {
    name: "", persons: 2, zipCode: "18435", stores: ["lidl", "aldi-nord", "rewe", "penny", "netto"], diet: "vegetarisch",
    allergies: ["laktose"], otherIntolerances: "", likes: [], dislikes: ["Brokkoli"], favoriteDishes: [], maxCookMinutes: 30,
    equipment: [], pantry: DEFAULT_PANTRY, leftoversForLunch: false,
  },
  budget: 20,
  weekStart: "2026-10-12",
  slots: Array.from({ length: 7 }, (_, i) => ({ mittag: false, abend: i < 5 })),
  favoritesCount: 0,
  wishes: "",
  knownDishes: [],
  lastWeekDishes: [],
};
const raw = demoPlan(req);
// KI-Preis absichtlich falsch: muss durch Angebotspreis ersetzt werden
raw.shopping[0].unitPrice = 0.01;
// Gericht in nicht angefragtem Slot
raw.meals.push({ ...raw.meals[0], id: "x", dayIndex: 6, slot: "mittag" });
const { plan, problems } = postprocess(raw, req, DEMO_OFFERS, { offerSource: "demo", demo: true });
assert.equal(plan.meals.length, 5, "nur angefragte Slots");
assert.equal(plan.shopping[0].price, 6.99, "Angebotspreis gilt");
assert.ok(plan.savings > 0, "Ersparnis berechnet");
assert.ok(problems.some((p) => p.includes("über dem Budget")), "Budget überschritten erkannt");
assert.ok(plan.warnings.some((w) => w.allergen.includes("Fleisch")), "vegetarisch-Verstoß erkannt");
assert.ok(plan.warnings.some((w) => w.allergen.includes("Laktose")), "Laktose erkannt (Mozzarella)");
assert.ok(plan.warnings.some((w) => w.allergen.includes("mag nicht")), "Abneigung erkannt");
console.log("Alle Prüfungen bestanden.", { total: plan.total, savings: plan.savings, warnings: plan.warnings.length, problems: problems.length });

// Gültigkeit am Einkaufstag (Zeiten wie von marktguru: Berliner Mitternacht in UTC)
import { validOn } from "../src/lib/offerDates";
const week = { ...DEMO_OFFERS[0], periods: [{ from: "2026-10-04T22:00:00Z", to: "2026-10-10T21:59:00Z" }] };
assert.equal(validOn(week, "2026-10-05"), true, "Montag gültig");
assert.equal(validOn(week, "2026-10-10"), true, "Samstag gültig");
assert.equal(validOn(week, "2026-10-12"), false, "nächster Montag nicht mehr");
assert.equal(validOn(week, "2026-10-04"), false, "Sonntag davor noch nicht");
console.log("Gültigkeitsprüfung bestanden.");
