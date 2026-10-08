import type { Offer, PlanRequest } from "./types";
import type { RawPlan } from "./postprocess";

// Beispieldaten, damit die App ohne API-Schlüssel ausprobiert werden kann (DEMO_MODE=1).
const o = (id: string, store: string, storeName: string, product: string, unit: string, price: number, oldPrice: number | null): Offer => ({
  id, store, storeName, product, brand: null, description: null, price, oldPrice, unit, referencePrice: null,
  validFrom: null, validTo: null, loyaltyRequired: false, imageUrl: null, source: "demo",
});

export const DEMO_OFFERS: Offer[] = [
  o("demo-1", "lidl", "Lidl", "Hähnchenbrustfilet", "1 kg", 6.99, 9.99),
  o("demo-2", "lidl", "Lidl", "Spaghetti", "500 g", 0.69, 0.99),
  o("demo-3", "aldi-nord", "Aldi Nord", "Rinderhackfleisch", "500 g", 3.49, 4.79),
  o("demo-4", "aldi-nord", "Aldi Nord", "Paprika Mix", "500 g", 1.49, 2.29),
  o("demo-5", "lidl", "Lidl", "Speisekartoffeln festkochend", "2,5 kg", 1.99, 2.99),
  o("demo-6", "rewe", "REWE", "Mozzarella", "125 g", 0.59, 0.95),
  o("demo-7", "aldi-nord", "Aldi Nord", "Passierte Tomaten", "500 g", 0.55, 0.79),
  o("demo-8", "lidl", "Lidl", "Brokkoli", "500 g", 0.99, 1.69),
  o("demo-9", "penny", "Penny", "Lachsfilet TK", "250 g", 2.99, 3.99),
  o("demo-10", "netto", "Netto Marken-Discount", "Eier Bodenhaltung", "10 Stück", 1.89, 2.39),
];

export function demoPlan(req: PlanRequest): RawPlan {
  const dishes = [
    { name: "Hähnchen-Paprika-Pfanne mit Reis", emoji: "🍗", ings: [["Hähnchenbrustfilet", 300, "g"], ["Paprika", 2, "Stück"], ["Reis", 150, "g"]], offers: ["demo-1", "demo-4"], cost: 3.2 },
    { name: "Spaghetti Bolognese", emoji: "🍝", ings: [["Spaghetti", 250, "g"], ["Rinderhackfleisch", 250, "g"], ["Passierte Tomaten", 500, "g"], ["Zwiebel", 1, "Stück"]], offers: ["demo-2", "demo-3", "demo-7"], cost: 2.6 },
    { name: "Ofenkartoffeln mit Kräuterquark", emoji: "🥔", ings: [["Kartoffeln", 800, "g"], ["Quark", 250, "g"], ["Schnittlauch", 1, "Bund"]], offers: ["demo-5"], cost: 1.9 },
    { name: "Lachs mit Brokkoli und Kartoffeln", emoji: "🐟", ings: [["Lachsfilet", 250, "g"], ["Brokkoli", 500, "g"], ["Kartoffeln", 600, "g"]], offers: ["demo-9", "demo-8", "demo-5"], cost: 4.4 },
    { name: "Tomaten-Mozzarella-Nudelauflauf", emoji: "🧀", ings: [["Spaghetti", 250, "g"], ["Passierte Tomaten", 500, "g"], ["Mozzarella", 125, "g"]], offers: ["demo-2", "demo-7", "demo-6"], cost: 1.9 },
    { name: "Bauernfrühstück", emoji: "🍳", ings: [["Kartoffeln", 600, "g"], ["Eier", 4, "Stück"], ["Zwiebel", 1, "Stück"]], offers: ["demo-5", "demo-10"], cost: 1.8 },
    { name: "Chili con Carne", emoji: "🌶️", ings: [["Rinderhackfleisch", 250, "g"], ["Kidneybohnen", 1, "Dose"], ["Mais", 1, "Dose"], ["Passierte Tomaten", 500, "g"]], offers: ["demo-3", "demo-7"], cost: 3.1 },
  ];
  const meals: RawPlan["meals"] = [];
  let k = 0;
  req.slots.forEach((s, day) => {
    (["mittag", "abend"] as const).forEach((slot) => {
      if (!s[slot]) return;
      const d = dishes[k++ % dishes.length];
      meals.push({
        id: `${day}-${slot}`,
        dayIndex: day,
        slot,
        name: d.name,
        emoji: d.emoji,
        description: "Beispielgericht aus dem Demo-Modus.",
        prepMinutes: 25,
        servings: req.profile.persons,
        isFavorite: false,
        leftoverOf: null,
        ingredients: d.ings.map(([name, amount, unit]) => ({ name: String(name), amount: Number(amount) * req.profile.persons / 2, unit: String(unit) })),
        offerIds: d.offers,
        estimatedCost: d.cost,
      });
    });
  });
  return {
    summary: "Demo-Plan: Ohne API-Schlüssel werden Beispieldaten angezeigt. Mit Schlüssel plant die KI anhand der echten Angebote aus Stralsund.",
    tips: ["Kartoffeln am Wochenanfang für zwei Gerichte vorkochen.", "Hackfleisch-Reste portionsweise einfrieren."],
    meals,
    shopping: [
      { name: "Hähnchenbrustfilet", quantity: "1 kg", packs: 1, store: "lidl", category: "Fleisch & Fisch", offerId: "demo-1", unitPrice: 6.99, forMeals: [] },
      { name: "Spaghetti", quantity: "2 × 500 g", packs: 2, store: "lidl", category: "Nudeln, Reis & Konserven", offerId: "demo-2", unitPrice: 0.69, forMeals: [] },
      { name: "Speisekartoffeln", quantity: "2,5 kg", packs: 1, store: "lidl", category: "Obst & Gemüse", offerId: "demo-5", unitPrice: 1.99, forMeals: [] },
      { name: "Brokkoli", quantity: "500 g", packs: 1, store: "lidl", category: "Obst & Gemüse", offerId: "demo-8", unitPrice: 0.99, forMeals: [] },
      { name: "Rinderhackfleisch", quantity: "500 g", packs: 1, store: "aldi-nord", category: "Fleisch & Fisch", offerId: "demo-3", unitPrice: 3.49, forMeals: [] },
      { name: "Paprika Mix", quantity: "500 g", packs: 1, store: "aldi-nord", category: "Obst & Gemüse", offerId: "demo-4", unitPrice: 1.49, forMeals: [] },
      { name: "Passierte Tomaten", quantity: "3 × 500 g", packs: 3, store: "aldi-nord", category: "Nudeln, Reis & Konserven", offerId: "demo-7", unitPrice: 0.55, forMeals: [] },
      { name: "Reis", quantity: "1 kg", packs: 1, store: "aldi-nord", category: "Nudeln, Reis & Konserven", offerId: null, unitPrice: 1.29, forMeals: [] },
      { name: "Speisequark", quantity: "500 g", packs: 1, store: "aldi-nord", category: "Kühlregal", offerId: null, unitPrice: 1.19, forMeals: [] },
      { name: "Zwiebeln", quantity: "1 kg Netz", packs: 1, store: "egal", category: "Obst & Gemüse", offerId: null, unitPrice: 1.29, forMeals: [] },
      { name: "Kidneybohnen", quantity: "1 Dose", packs: 1, store: "egal", category: "Nudeln, Reis & Konserven", offerId: null, unitPrice: 0.79, forMeals: [] },
    ],
  };
}
