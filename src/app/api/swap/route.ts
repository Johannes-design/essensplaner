import Anthropic from "@anthropic-ai/sdk";
import { requireCode } from "@/lib/auth";
import { costCents, generateSwap, hasApiKey } from "@/lib/ai";
import { offersToPromptLines } from "@/lib/offers";
import { isDemo, loadOffers, selectForPrompt } from "@/lib/offer-source";
import { postprocess, type RawPlan } from "@/lib/postprocess";
import type { Plan, PlanRequest, Profile, WeekSlots } from "@/lib/types";

export const maxDuration = 120;

interface SwapRequest {
  plan: Plan;
  mealId: string;
  wish: string;
  profile: Profile;
  knownDishes: string[];
  confirmed?: boolean;
}

export async function POST(request: Request) {
  const denied = requireCode(request);
  if (denied) return denied;
  const body = (await request.json()) as SwapRequest;
  if (body.confirmed !== true) return Response.json({ error: "Bitte die Kosten bestätigen" }, { status: 400 });
  const { plan, profile } = body;
  const meal = plan?.meals?.find((m) => m.id === body.mealId);
  if (!plan || !meal || !profile) return Response.json({ error: "Gericht nicht gefunden" }, { status: 400 });

  const slots: WeekSlots = Array.from({ length: 7 }, (_, i) => ({
    mittag: plan.meals.some((m) => m.dayIndex === i && m.slot === "mittag"),
    abend: plan.meals.some((m) => m.dayIndex === i && m.slot === "abend"),
  }));
  const req: PlanRequest = { profile, budget: plan.budget, weekStart: plan.weekStart, slots, favoritesCount: 0, wishes: "", knownDishes: [], lastWeekDishes: [] };
  const toRaw = (meals: Plan["meals"], shopping: RawPlan["shopping"]): RawPlan => ({ summary: plan.summary, tips: plan.tips, meals, shopping });
  const keepIdentity = (p: Plan, extraCents: number): Plan => ({
    ...p,
    id: plan.id,
    createdAt: plan.createdAt,
    offerSource: plan.offerSource,
    aiCostCents: Math.round(((plan.aiCostCents ?? 0) + extraCents) * 10) / 10,
  });

  if (isDemo() || !hasApiKey()) {
    const swapped = { ...meal, name: `${meal.name} (Demo-Alternative)`, emoji: "🔄", description: "Demo-Modus: Hier stünde ein neues Gericht." };
    const raw = toRaw(plan.meals.map((m) => (m.id === meal.id ? swapped : m)), plan.shopping.map((s) => ({ ...s, unitPrice: s.price / Math.max(1, s.packs) })));
    const { plan: next } = postprocess(raw, req, [], { offerSource: plan.offerSource, demo: true });
    return Response.json({ plan: keepIdentity(next, 0), note: "Demo-Tausch" });
  }

  try {
    const { offers } = await loadOffers(profile.zipCode, profile.stores, plan.weekStart, { allowWebSearch: false });
    const forPrompt = selectForPrompt(offers);
    const args = { plan, meal, wish: body.wish ?? "", profile, knownDishes: (body.knownDishes ?? []).slice(0, 80), offerLines: offersToPromptLines(forPrompt), offerCount: forPrompt.length };

    let cents = 0;
    let out = await generateSwap(args);
    cents += costCents(out.message.usage);
    const build = (o: typeof out) => {
      const newMeal = { ...o.data.meal, id: meal.id, dayIndex: meal.dayIndex, slot: meal.slot };
      return postprocess(toRaw(plan.meals.map((m) => (m.id === meal.id ? newMeal : m)), o.data.shopping), req, offers, { offerSource: plan.offerSource, demo: false });
    };
    let result = build(out);
    // Allergien/Ernährung sind Pflicht – Budget-Hinweise nicht, ein Tausch darf etwas teurer werden
    const hard = result.problems.filter((p) => !p.includes("Budget") && !p.includes("fehlt ein Gericht"));
    if (hard.length) {
      out = await generateSwap(args, { previous: out.message.content, problems: hard });
      cents += costCents(out.message.usage);
      result = build(out);
    }
    return Response.json({ plan: keepIdentity(result.plan, cents), note: out.data.note });
  } catch (e) {
    console.error("[swap]", e);
    const msg = e instanceof Anthropic.APIError ? `KI-Dienst nicht erreichbar (${e.status ?? "Netzwerk"})` : e instanceof Error ? e.message : "Unbekannter Fehler";
    return Response.json({ error: msg }, { status: 502 });
  }
}
