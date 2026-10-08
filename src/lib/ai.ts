import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { allergenLabel } from "./allergens";
import { CATEGORIES, STORES, storeName } from "./constants";
import { DAYS, type Meal, type Offer, type PlanRequest, type Profile, type Recipe } from "./types";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

let _client: Anthropic | null = null;
export function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

export const hasApiKey = () => !!process.env.ANTHROPIC_API_KEY;

// ---------- Schemas für strukturierte Ausgaben ----------

const IngredientSchema = z.object({
  name: z.string(),
  amount: z.number().nullable(),
  unit: z.string(),
});

const MealSchema = z.object({
  id: z.string().describe("kurze eindeutige ID, z. B. 'mo-abend'"),
  dayIndex: z.number().int().describe("0 = Montag … 6 = Sonntag"),
  slot: z.enum(["mittag", "abend"]),
  name: z.string(),
  emoji: z.string(),
  description: z.string().describe("ein appetitlicher Satz"),
  prepMinutes: z.number().int(),
  servings: z.number().int(),
  isFavorite: z.boolean().describe("true, wenn es eines der Lieblingsgerichte aus dem Profil ist"),
  leftoverOf: z.string().nullable().describe("ID des Gerichts, dessen Reste hier gegessen werden, sonst null"),
  ingredients: z.array(IngredientSchema),
  offerIds: z.array(z.string()).describe("IDs der genutzten Angebote"),
  estimatedCost: z.number().describe("anteilige Kosten in Euro"),
});

const ShoppingSchema = z.object({
  name: z.string().describe("Produkt, wie man es im Laden findet"),
  quantity: z.string().describe("z. B. '2 × 500 g' oder '1 Netz (1 kg)'"),
  packs: z.number().describe("Anzahl Packungen/Stück, die gekauft werden"),
  store: z.string().describe("Händler-Key, bei Angeboten der Markt des Angebots, sonst der günstigste passende Markt oder 'egal'"),
  category: z.enum(CATEGORIES as [string, ...string[]]),
  offerId: z.string().nullable().describe("ID des Angebots, wenn das Produkt ein Angebot ist, sonst null"),
  unitPrice: z.number().describe("Preis pro Packung in Euro (bei Angeboten exakt der Angebotspreis)"),
  forMeals: z.array(z.string()).describe("IDs der Gerichte"),
});

export const PlanSchema = z.object({
  summary: z.string().describe("2–3 Sätze: Idee der Woche, wo eingekauft wird, wie gespart wird"),
  meals: z.array(MealSchema),
  shopping: z.array(ShoppingSchema),
  tips: z.array(z.string()).describe("2–4 kurze praktische Tipps (Vorkochen, Reste, Einfrieren)"),
});
export type PlanOutput = z.infer<typeof PlanSchema>;

const RecipeSchema = z.object({
  title: z.string(),
  servings: z.number().int(),
  totalMinutes: z.number().int(),
  ingredients: z.array(z.object({ amount: z.string(), name: z.string() })),
  steps: z.array(z.object({ text: z.string(), minutes: z.number().int().nullable() })),
  tips: z.array(z.string()),
});

// ---------- Prompts ----------

function profileText(p: Profile) {
  const allergies = p.allergies.map(allergenLabel);
  return [
    `Personen: ${p.persons}`,
    `Ernährungsform: ${p.diet}`,
    `ALLERGIEN (absolut verboten, auch keine Spuren als Zutat): ${allergies.length ? allergies.join("; ") : "keine"}`,
    `Weitere Unverträglichkeiten / No-Gos: ${p.otherIntolerances.trim() || "keine"}`,
    `Isst gerne: ${p.likes.join(", ") || "-"}`,
    `Mag nicht (nicht verwenden): ${p.dislikes.join(", ") || "-"}`,
    `Lieblingsgerichte: ${p.favoriteDishes.join("; ") || "-"}`,
    `Maximale aktive Kochzeit pro Gericht: ${p.maxCookMinutes} Minuten (die Person ist kochfaul – lieber einfach!)`,
    `Küchengeräte: Herd, ${p.equipment.join(", ") || "sonst nichts"}`,
    `Bereits im Vorrat (nicht einkaufen, darf verwendet werden): ${p.pantry.join(", ") || "nichts"}`,
  ].join("\n");
}

const SYSTEM = `Du bist ein sparsamer, praktischer Essensplaner für Menschen, die wenig Lust auf Kochen haben.
Du planst eine Woche Essen, die günstig, abwechslungsreich, alltagstauglich und lecker ist, und erstellst die passende Einkaufsliste.

Harte Regeln (niemals brechen):
1. ALLERGIEN und Unverträglichkeiten haben oberste Priorität. Verwende keine Zutat und kein Produkt, das ein genanntes Allergen enthält oder typischerweise enthält (z. B. Pesto → Nüsse, Wraps → Gluten, Mayonnaise → Ei). Nutze bei Bedarf ausdrücklich freie Alternativen ("laktosefreie Milch", "glutenfreie Nudeln") und schreibe das so in den Produktnamen.
2. Die Einkaufsliste muss in das Budget passen. Weniger ausgeben ist besser.
3. Bei Angeboten aus der Liste ist der Preis pro Packung exakt der Angebotspreis und die offerId muss exakt übernommen werden. Erfinde keine Angebote oder IDs.
4. Für Produkte ohne Angebot schätze realistische deutsche Discounter-Preise (Aldi/Lidl-Niveau, 2026) und setze offerId = null.
5. Plane nur die angefragten Mahlzeiten. Jedes Gericht im Plan muss genau einem angefragten Slot entsprechen.
6. Die Einkaufsliste rechnet in ganzen Packungen, wie man sie im Laden kauft, und deckt alle Zutaten aller Gerichte ab – außer Vorrat.

Gute Planung:
- Nutze Angebote gezielt und plane Gerichte so, dass angebrochene Packungen in mehreren Gerichten aufgebraucht werden (wenig Verschwendung).
- Bevorzuge wenige Märkte (am besten 1–2), damit der Einkauf einfach bleibt.
- Kochfaul-freundlich: One-Pot, Blech, Pfanne, Auflauf, wenig Abwasch, kurze aktive Zeit. Abwechslung über die Woche.
- Mengen passend zur Personenzahl. Gerichte, deren Reste am nächsten Tag gegessen werden, mit doppelter Portion planen (leftoverOf setzen).
- Alle Texte auf Deutsch, Gerichtnamen kurz und verständlich.`;

export function buildPlanPrompt(req: PlanRequest, offers: Offer[], offerLines: string, offerSourceNote: string) {
  const p = req.profile;
  const slotLines = req.slots
    .map((s, i) => {
      const parts = [s.mittag ? "Mittag" : null, s.abend ? "Abendbrot" : null].filter(Boolean);
      return `${DAYS[i]} (dayIndex ${i}): ${parts.length ? parts.join(" + ") : "nichts planen"}`;
    })
    .join("\n");
  const count = req.slots.reduce((n, s) => n + (s.mittag ? 1 : 0) + (s.abend ? 1 : 0), 0);
  const storesAllowed = p.stores.map((k) => `${k} (${storeName(k)})`).join(", ");

  return `## Profil
${profileText(p)}

## Woche ab ${req.weekStart}
Budget für den gesamten Einkauf: ${req.budget.toFixed(2)} € (Ziel: deutlich darunter bleiben, wenn es geht)
Zu planende Mahlzeiten (${count} Stück):
${slotLines}
${p.leftoversForLunch ? "Reste-Option AN: Ein Mittagessen darf gerne aus den Resten des Abendessens vom Vortag bestehen (dann leftoverOf setzen, keine eigenen Zutaten einkaufen)." : ""}
Lieblingsgerichte einplanen: ${req.favoritesCount > 0 && p.favoriteDishes.length ? `ca. ${Math.min(req.favoritesCount, p.favoriteDishes.length)} Lieblingsgerichte aus dem Profil in dieser Woche verwenden (isFavorite = true)` : "optional"}
Wünsche für diese Woche: ${req.wishes.trim() || "keine"}

## Rezeptbuch (Gerichte mit fertigem Rezept – Wiederverwenden spart Kosten)
${req.knownDishes?.length ? req.knownDishes.slice(0, 80).join("; ") : "(noch leer)"}
Nutze passende Gerichte aus dem Rezeptbuch gerne wieder und übernimm dann den Namen exakt. Etwa die Hälfte der Woche darf daraus kommen, wenn es zu Angeboten und Budget passt – Abwechslung bleibt wichtig.
${req.lastWeekDishes?.length ? `Letzte Woche gab es schon: ${req.lastWeekDishes.join("; ")} – diese Woche möglichst andere Gerichte.` : ""}

## Erlaubte Märkte (Händler-Keys)
${storesAllowed}
Nutze für "store" nur diese Keys oder "egal".

## Aktuelle Angebote (${offers.length} Stück, ${offerSourceNote})
Format: ID | Markt | Produkt | Menge | Preis | Normalpreis | Grundpreis
${offerLines || "(keine Angebote verfügbar – schätze normale Discounter-Preise)"}

Erstelle jetzt den Wochenplan und die Einkaufsliste.`;
}

// US-Dollar pro 1 Mio. Token: [Input, Output]
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-haiku-5-5": [0.1, 0.5],
};

/** Grobe Kosten eines Aufrufs in US-Cent (inkl. Cache-Lese/-Schreibpreisen). */
export function costCents(u: Anthropic.Beta.BetaUsage): number {
  const [inp, out] = PRICES[MODEL] ?? [2, 10];
  const usd =
    ((u.input_tokens ?? 0) * inp +
      (u.cache_creation_input_tokens ?? 0) * inp * 1.25 +
      (u.cache_read_input_tokens ?? 0) * inp * 0.1 +
      (u.output_tokens ?? 0) * out) /
    1_000_000;
  return usd * 100;
}

/** Ruft Claude mit strukturierter Ausgabe auf (Streaming, damit lange Antworten nicht in Timeouts laufen). */
async function structured<T extends z.ZodType>(
  schema: T,
  messages: Anthropic.Beta.BetaMessageParam[],
  opts: { system: string; effort: "low" | "medium" | "high"; maxTokens: number; onProgress?: (chars: number) => void },
): Promise<{ data: z.infer<T>; message: Anthropic.Beta.BetaMessage }> {
  const stream = client().beta.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Bei Korrekturrunden wird der bisherige Verlauf aus dem Cache gelesen (≈ 90 % günstiger)
    cache_control: { type: "ephemeral" },
    system: opts.system,
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort, format: zodOutputFormat(schema) },
    messages,
  });
  let chars = 0;
  stream.on("text", (delta) => {
    chars += delta.length;
    opts.onProgress?.(chars);
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new Error("Die KI hat die Anfrage abgelehnt. Bitte Wünsche anpassen.");
  if (message.stop_reason === "max_tokens") throw new Error("Die Antwort war zu lang. Bitte weniger Mahlzeiten auf einmal planen.");
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const data = schema.parse(JSON.parse(text));
  return { data, message };
}

export async function generatePlan(
  messages: Anthropic.Beta.BetaMessageParam[],
  onProgress?: (chars: number) => void,
) {
  return structured(PlanSchema, messages, { system: SYSTEM, effort: "medium", maxTokens: 48000, onProgress });
}

export async function generateRecipe(meal: Meal, profile: Profile): Promise<{ recipe: Recipe; costCents: number }> {
  const prompt = `Schreibe ein einfaches, gut verständliches Rezept für "${meal.name}" (${meal.description}).
Portionen: ${meal.servings}. Maximale aktive Zeit: ${profile.maxCookMinutes} Minuten.
Verwende genau diese eingekauften Zutaten (Mengen dürfen auf die Portionen verteilt sein) plus Vorrat (${profile.pantry.join(", ") || "nichts"}):
${meal.ingredients.map((i) => `- ${i.amount ?? ""} ${i.unit} ${i.name}`.trim()).join("\n")}
Küchengeräte: Herd, ${profile.equipment.join(", ") || "sonst nichts"}.
ALLERGIEN – absolut verboten: ${profile.allergies.map(allergenLabel).join("; ") || "keine"}. Weitere No-Gos: ${profile.otherIntolerances || "keine"}.
${meal.leftoverOf ? "Dieses Gericht besteht aus Resten vom Vortag: beschreibe kurz das Aufwärmen/Aufpeppen." : ""}
Schritte kurz und konkret (Temperaturen, Zeiten, Pfannengröße), für Kochanfänger. Maximal 8 Schritte. Tipps: z. B. Abwandlung, Aufbewahrung.
Das Rezept wird gespeichert und in späteren Wochen wiederverwendet: Schreibe es deshalb allgemein (keine Wochentage, keine Hinweise auf andere Gerichte dieser Woche, außer bei Resten).`;
  const { data, message } = await structured(RecipeSchema, [{ role: "user", content: prompt }], {
    system: "Du bist eine geduldige Kochlehrerin für kochfaule Menschen. Antworte auf Deutsch.",
    effort: "low",
    maxTokens: 16000,
  });
  return { recipe: data, costCents: costCents(message.usage) };
}

/** Fallback, wenn keine Prospektdaten abrufbar sind: Claude sucht die Angebote im Web. */
export async function searchOffersOnWeb(zip: string, stores: string[], weekStart: string): Promise<Offer[]> {
  const names = stores.map(storeName).join(", ");
  const tools = [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 8, user_location: { type: "approximate" as const, city: "Stralsund", region: "Mecklenburg-Vorpommern", country: "DE", timezone: "Europe/Berlin" } }];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Suche die aktuellen Lebensmittel-Angebote aus den Prospekten für die Woche ab ${weekStart} für PLZ ${zip} (Stralsund) bei: ${names}.
Konzentriere dich auf Zutaten zum Kochen (Fleisch, Fisch, Milchprodukte, Gemüse, Obst, Nudeln, Reis, Kartoffeln, Konserven).
Gib am Ende NUR eine Liste aus, eine Zeile pro Angebot, exakt in diesem Format ohne Aufzählungszeichen:
MARKT | PRODUKT | MENGE | PREIS | NORMALPREIS
Beispiel: Lidl | Hähnchenbrustfilet | 1 kg | 6.99 | 9.49
Preise mit Punkt als Dezimaltrenner, Normalpreis leer lassen, wenn unbekannt. Nur Angebote, die du wirklich gefunden hast.`,
    },
  ];
  let response: Anthropic.Beta.BetaMessage | null = null;
  for (let i = 0; i < 4; i++) {
    response = await client()
      .beta.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        tools,
        messages,
      })
      .finalMessage();
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }
  if (!response) return [];
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
  const offers: Offer[] = [];
  let n = 0;
  for (const line of text.split("\n")) {
    const parts = line.split("|").map((s) => s.trim());
    if (parts.length < 4) continue;
    const price = parseFloat(parts[3].replace(",", ".").replace(/[^\d.]/g, ""));
    if (!price || isNaN(price)) continue;
    const store = STORES.find((s) => parts[0].toLowerCase().includes(s.name.toLowerCase().split(" ")[0].toLowerCase()));
    if (!store) continue;
    const old = parts[4] ? parseFloat(parts[4].replace(",", ".").replace(/[^\d.]/g, "")) : NaN;
    offers.push({
      id: `ws-${++n}`,
      store: store.key,
      storeName: store.name,
      product: parts[1],
      brand: null,
      description: null,
      price,
      oldPrice: !isNaN(old) && old > price ? old : null,
      unit: parts[2] || null,
      referencePrice: null,
      validFrom: null,
      validTo: null,
      loyaltyRequired: false,
      imageUrl: null,
      source: "websuche",
    });
  }
  return offers;
}
