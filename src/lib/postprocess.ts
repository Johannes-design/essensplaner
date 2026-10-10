import { findAllergens } from "./allergens";
import { STORES } from "./constants";
import type { AllergenWarning, Meal, Offer, Plan, PlanRequest, ShoppingItem } from "./types";
import { DAYS } from "./types";

// Aus dem KI-Schema, hier ohne zod-Abhängigkeit beschrieben
export interface RawPlan {
  summary: string;
  tips: string[];
  meals: Omit<Meal, never>[];
  shopping: {
    name: string;
    quantity: string;
    packs: number;
    store: string;
    category: string;
    offerId: string | null;
    unitPrice: number;
    forMeals: string[];
  }[];
}

const MEAT = ["fleisch", "hack", "hähnchen", "huhn", "pute", "schwein", "rind", "kalb", "lamm", "wurst", "schinken", "speck", "salami", "bacon", "chorizo", "gulasch", "schnitzel", "frikadelle", "bulette", "leberkäse", "kassler", "geschnetzeltes", "filet", "steak", "mett", "wiener", "bockwurst", "gelatine", "brühwürfel rind", "hühnerbrühe"];
const FISH = ["fisch", "lachs", "thunfisch", "kabeljau", "seelachs", "forelle", "hering", "makrele", "garnele", "shrimp", "krabbe", "muschel", "tintenfisch", "calamari", "sardine", "anchovis", "pangasius", "dorsch", "matjes", "surimi"];
const ANIMAL = ["milch", "sahne", "butter", "käse", "joghurt", "quark", "schmand", "crème fraîche", "frischkäse", "mozzarella", "parmesan", "feta", "eier", "honig", "mayonnaise", "rahm", "ghee"];
const VEG_OK = ["vegan", "vegetarisch", "veggie", "pflanzlich", "soja", "tofu", "hafermilch", "sojamilch", "mandelmilch", "kokosmilch", "erdnussbutter", "margarine", "seitan", "planted", "beyond", "fleischersatz", "butterbohne"];

function dietViolation(text: string, diet: PlanRequest["profile"]["diet"]): string | null {
  const t = text.toLowerCase();
  if (VEG_OK.some((w) => t.includes(w))) return null;
  if (diet === "vegetarisch" || diet === "vegan" || diet === "pescetarisch") {
    if (MEAT.some((w) => t.includes(w)) && !(diet === "pescetarisch" && FISH.some((w) => t.includes(w)))) return "Fleisch";
  }
  if (diet === "vegetarisch" || diet === "vegan") {
    if (FISH.some((w) => t.includes(w))) return "Fisch";
  }
  if (diet === "vegan" && (ANIMAL.some((w) => t.includes(w)) || /(^|[^a-zäöüß])ei([^a-zäöüß]|$)/.test(t))) return "tierisches Produkt";
  return null;
}

export function postprocess(raw: RawPlan, req: PlanRequest, offers: Offer[], meta: { offerSource: Plan["offerSource"]; demo: boolean }) {
  const { profile } = req;
  const offerMap = new Map(offers.map((o) => [o.id, o]));
  const problems: string[] = [];
  const validStore = (s: string) => (STORES.some((x) => x.key === s) ? s : "egal");

  // Gerichte: nur angefragte Slots, je Slot genau eins
  const used = new Set<string>();
  const meals: Meal[] = [];
  for (const m of raw.meals) {
    const key = `${m.dayIndex}-${m.slot}`;
    const slot = req.slots[m.dayIndex];
    if (!slot || !slot[m.slot] || used.has(key)) continue;
    used.add(key);
    meals.push({
      ...m,
      id: m.id || key,
      offerIds: (m.offerIds ?? []).filter((id) => offerMap.has(id)),
      ingredients: m.ingredients ?? [],
    });
  }
  meals.sort((a, b) => a.dayIndex - b.dayIndex || (a.slot === "mittag" ? -1 : 1));
  req.slots.forEach((s, i) => {
    (["mittag", "abend"] as const).forEach((slot) => {
      if (s[slot] && !used.has(`${i}-${slot}`)) problems.push(`Für ${DAYS[i]} ${slot === "mittag" ? "Mittag" : "Abendbrot"} fehlt ein Gericht.`);
    });
  });

  // Einkaufsliste: Preise der Angebote sind maßgeblich, nicht die Schätzung der KI
  const shopping: ShoppingItem[] = raw.shopping.map((s, i) => {
    const packs = Math.max(1, Math.round(s.packs || 1));
    const offer = s.offerId ? offerMap.get(s.offerId) : undefined;
    if (offer) {
      return {
        id: `s${i}`,
        name: s.name,
        quantity: s.quantity,
        packs,
        store: offer.store,
        category: s.category,
        offerId: offer.id,
        price: round(offer.price * packs),
        regularPrice: offer.oldPrice ? round(offer.oldPrice * packs) : null,
        priceIsEstimate: false,
        forMeals: s.forMeals ?? [],
      };
    }
    return {
      id: `s${i}`,
      name: s.name,
      quantity: s.quantity,
      packs,
      store: validStore(s.store),
      category: s.category,
      offerId: null,
      price: round(Math.max(0, s.unitPrice) * packs),
      regularPrice: null,
      priceIsEstimate: true,
      forMeals: s.forMeals ?? [],
    };
  });

  const total = round(shopping.reduce((n, s) => n + s.price, 0));
  const savings = round(shopping.reduce((n, s) => n + (s.regularPrice ? s.regularPrice - s.price : 0), 0));
  if (total > req.budget) {
    problems.push(`Die Einkaufsliste kostet ${total.toFixed(2)} € und liegt damit über dem Budget von ${req.budget.toFixed(2)} €. Plane günstiger (mehr Angebote, günstigere Zutaten, Reste nutzen).`);
  }

  // Sicherheitsprüfung: Allergien, Ernährungsform, Abneigungen
  const warnings: AllergenWarning[] = [];
  const check = (text: string, mealId: string | null) => {
    for (const a of findAllergens(text, profile.allergies)) warnings.push({ mealId, item: text, allergen: a });
    const d = dietViolation(text, profile.diet);
    if (d) warnings.push({ mealId, item: text, allergen: `${d} (Ernährungsform ${profile.diet})` });
    for (const dis of profile.dislikes) {
      if (dis.trim().length > 2 && text.toLowerCase().includes(dis.trim().toLowerCase())) warnings.push({ mealId, item: text, allergen: `mag nicht: ${dis}` });
    }
  };
  for (const m of meals) {
    check(m.name, m.id);
    for (const ing of m.ingredients) check(ing.name, m.id);
  }
  for (const s of shopping) check(s.name, null);
  const uniq = dedupeWarnings(warnings);
  if (uniq.length) {
    problems.push(
      "Diese Zutaten verstoßen gegen Allergien/Ernährung/Abneigungen und müssen ersetzt werden (oder ausdrücklich als freie Variante benannt werden, z. B. 'laktosefrei', 'glutenfrei'): " +
        uniq.map((w) => `"${w.item}" → ${w.allergen}`).join("; "),
    );
  }

  const plan: Plan = {
    id: `plan-${Date.now()}`,
    createdAt: new Date().toISOString(),
    weekStart: req.weekStart,
    shoppingDate: req.shoppingDate,
    budget: req.budget,
    persons: profile.persons,
    summary: raw.summary,
    tips: raw.tips ?? [],
    meals,
    shopping,
    total,
    savings,
    offerSource: meta.offerSource,
    warnings: uniq,
    demo: meta.demo,
    aiCostCents: null,
  };
  return { plan, problems };
}

function dedupeWarnings(w: AllergenWarning[]) {
  const seen = new Set<string>();
  return w.filter((x) => {
    const k = `${x.item.toLowerCase()}|${x.allergen}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
