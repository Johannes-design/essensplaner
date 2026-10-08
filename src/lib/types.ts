export type Slot = "mittag" | "abend";

export const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
export const DAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

export type Diet = "alles" | "flexitarisch" | "pescetarisch" | "vegetarisch" | "vegan";

export interface Profile {
  name: string;
  persons: number;
  zipCode: string;
  stores: string[]; // Händler-Keys aus STORES
  diet: Diet;
  allergies: string[]; // Keys aus ALLERGENS
  otherIntolerances: string; // Freitext, z. B. "Fruktose, scharfes Essen"
  likes: string[];
  dislikes: string[];
  favoriteDishes: string[];
  maxCookMinutes: number;
  equipment: string[];
  pantry: string[]; // Vorrat, wird nicht eingekauft
  /** Mittagessen-Slots: Plan für Abend auch mittags am nächsten Tag (Reste) */
  leftoversForLunch: boolean;
}

export type WeekSlots = { mittag: boolean; abend: boolean }[]; // Index 0 = Montag

export interface Offer {
  id: string;
  store: string; // Händler-Key
  storeName: string;
  product: string;
  brand: string | null;
  description: string | null;
  price: number;
  oldPrice: number | null;
  unit: string | null; // z. B. "500 g"
  referencePrice: string | null; // z. B. "7,98 €/kg"
  validFrom: string | null;
  validTo: string | null;
  loyaltyRequired: boolean;
  imageUrl: string | null;
  source: "marktguru" | "websuche" | "demo";
}

export interface Ingredient {
  name: string;
  amount: number | null;
  unit: string;
}

export interface Meal {
  id: string;
  dayIndex: number;
  slot: Slot;
  name: string;
  emoji: string;
  description: string;
  prepMinutes: number;
  servings: number;
  isFavorite: boolean;
  leftoverOf: string | null; // id des Gerichts, dessen Reste verwendet werden
  ingredients: Ingredient[];
  offerIds: string[];
  estimatedCost: number;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string; // "2 Packungen à 500 g"
  packs: number;
  store: string; // Händler-Key oder "egal"
  category: string;
  offerId: string | null;
  price: number; // Gesamtpreis dieser Position
  regularPrice: number | null; // Normalpreis gesamt, wenn Angebot
  priceIsEstimate: boolean;
  forMeals: string[];
}

export interface AllergenWarning {
  mealId: string | null;
  item: string;
  allergen: string;
}

export interface Plan {
  id: string;
  createdAt: string;
  weekStart: string; // ISO-Datum (Montag)
  budget: number;
  persons: number;
  summary: string;
  tips: string[];
  meals: Meal[];
  shopping: ShoppingItem[];
  total: number;
  savings: number;
  offerSource: Offer["source"] | "keine";
  warnings: AllergenWarning[];
  demo: boolean;
  /** geschätzte KI-Kosten für diesen Plan in US-Cent */
  aiCostCents: number | null;
}

export interface Recipe {
  title: string;
  servings: number;
  totalMinutes: number;
  ingredients: { amount: string; name: string }[];
  steps: { text: string; minutes: number | null }[];
  tips: string[];
}

export interface PlanRequest {
  profile: Profile;
  budget: number;
  weekStart: string;
  slots: WeekSlots;
  favoritesCount: number;
  wishes: string;
  /** Gerichte, für die schon ein Rezept im Rezeptbuch liegt */
  knownDishes: string[];
  /** Gerichte der letzten Woche (für Abwechslung) */
  lastWeekDishes: string[];
}

export interface CookbookEntry {
  key: string;
  name: string;
  emoji: string;
  description: string;
  recipe: Recipe;
  savedAt: string;
  uses: number;
}
