import { requireAuth } from "@/lib/auth";
import { recordCost } from "@/lib/costs";
import Anthropic from "@anthropic-ai/sdk";
import { generateRecipe, hasApiKey } from "@/lib/ai";
import { isDemo } from "@/lib/offer-source";
import type { Meal, Profile, Recipe } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { meal, profile } = (await request.json()) as { meal: Meal; profile: Profile };
  if (!meal?.name || !profile) return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });

  if (isDemo() || !hasApiKey()) {
    const recipe: Recipe = {
      title: meal.name,
      servings: meal.servings,
      totalMinutes: meal.prepMinutes,
      ingredients: meal.ingredients.map((i) => ({ amount: `${i.amount ?? ""} ${i.unit}`.trim(), name: i.name })),
      steps: [
        { text: "Demo-Modus: Hier steht mit API-Schlüssel die vollständige Schritt-für-Schritt-Anleitung.", minutes: null },
        { text: "Alle Zutaten vorbereiten, waschen und klein schneiden.", minutes: 10 },
        { text: "In einer großen Pfanne anbraten, würzen und fertig garen.", minutes: 15 },
      ],
      tips: ["Reste halten sich im Kühlschrank 2 Tage."],
    };
    return Response.json({ recipe, demo: true });
  }

  try {
    const { recipe, costCents } = await generateRecipe(meal, profile);
    await recordCost(auth.householdId, costCents);
    return Response.json({ recipe, costCents });
  } catch (e) {
    console.error("[recipe]", e);
    const msg = e instanceof Anthropic.APIError ? `KI-Dienst nicht erreichbar (${e.status ?? "Netzwerk"})` : e instanceof Error ? e.message : "Unbekannter Fehler";
    return Response.json({ error: msg }, { status: 502 });
  }
}
