"use client";
import { apiFetch } from "@/lib/sync";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { dishKey, euro, findInCookbook, getStored, useStored, write } from "@/lib/store";
import { useCurrentPlan } from "@/lib/usePlan";
import { storeName } from "@/lib/constants";
import { DAYS, type Recipe } from "@/lib/types";
import { Ingredients, Steps } from "@/components/RecipeView";
import { Empty, Loading } from "@/components/ui";
import MealActions from "@/components/MealActions";
import { useRouter } from "next/navigation";

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Gericht />
    </Suspense>
  );
}

function Gericht() {
  const params = useSearchParams();
  const id = params.get("id");
  const { plan } = useCurrentPlan();
  const [profile, setProfile] = useStored("profile");
  const [cookbook] = useStored("cookbook");
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [menu, setMenu] = useState(false);
  const router = useRouter();
  // Demo-Rezepte werden nicht ins Rezeptbuch übernommen
  const [demoRecipe, setDemoRecipe] = useState<{ key: string; recipe: Recipe } | null>(null);
  const meal = plan?.meals.find((m) => m.id === id);
  const key = meal ? dishKey(meal.name, meal.servings) : "";
  // Rezept aus dem Rezeptbuch – nur wenn keins da ist, wird eins erzeugt (kostet KI-Guthaben)
  const recipe = meal ? (findInCookbook(cookbook, meal.name, meal.servings)?.recipe ?? (demoRecipe?.key === key ? demoRecipe.recipe : undefined)) : undefined;

  const needsRecipe = cookbook !== undefined && !!meal && !!profile && !recipe;
  const failed = error?.key === `${key}#${attempt}` ? error.message : null;

  useEffect(() => {
    if (!needsRecipe || !meal || !profile) return;
    let cancelled = false;
    const tag = `${key}#${attempt}`;
    apiFetch("/api/recipe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ meal, profile }) })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Rezept konnte nicht geladen werden");
        if (cancelled) return;
        if (j.demo) return setDemoRecipe({ key, recipe: j.recipe });
        write("cookbook", {
          ...getStored("cookbook"),
          [key]: { key, name: meal.name, emoji: meal.emoji, description: meal.description, recipe: j.recipe, savedAt: new Date().toISOString(), uses: 1 },
        });
      })
      .catch((e) => !cancelled && setError({ key: tag, message: e instanceof Error ? e.message : "Fehler" }));
    return () => {
      cancelled = true;
    };
    // meal/profile sind über key stabil genug; erneuter Versuch über attempt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsRecipe, key, attempt]);

  if (plan === undefined || profile === undefined) return <Loading />;
  if (!plan || !meal || !profile) return <Empty icon="🤔" title="Gericht nicht gefunden" text="Vielleicht wurde der Plan gelöscht." action={<Link href="/" className="btn-primary">Zur Woche</Link>} />;

  const isFav = profile.favoriteDishes.some((f) => f.toLowerCase() === meal.name.toLowerCase());
  const toggleFav = () =>
    setProfile({
      ...profile,
      favoriteDishes: isFav ? profile.favoriteDishes.filter((f) => f.toLowerCase() !== meal.name.toLowerCase()) : [...profile.favoriteDishes, meal.name],
    });
  const offers = plan.shopping.filter((s) => s.offerId && (meal.offerIds.includes(s.offerId) || s.forMeals.includes(meal.id)));
  const warnings = plan.warnings.filter((w) => w.mealId === meal.id);
  const leftoverSource = meal.leftoverOf ? plan.meals.find((m) => m.id === meal.leftoverOf) : null;

  return (
    <div>
      <Link href={plan.id === getStored("plans")[0]?.id ? "/" : `/?plan=${plan.id}`} className="mb-3 inline-block text-sm text-brand-600">‹ Zur Woche</Link>
      <div className="card mb-4 p-5 text-center">
        <div className="text-6xl">{meal.emoji || "🍽️"}</div>
        <div className="mt-2 text-xs font-medium uppercase tracking-wide text-stone-500">{DAYS[meal.dayIndex]} · {meal.slot === "mittag" ? "Mittag" : "Abendbrot"}</div>
        <h1 className="mt-1 text-2xl font-bold">{meal.name}</h1>
        <p className="mt-1 text-sm text-stone-500">{meal.description}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm">
          <span className="chip-off">⏱ {recipe?.totalMinutes ?? meal.prepMinutes} Min.</span>
          <span className="chip-off">👥 {meal.servings} Portionen</span>
          <span className="chip-off">💶 ca. {euro(meal.estimatedCost)}</span>
        </div>
        <button type="button" onClick={toggleFav} className={`mt-4 ${isFav ? "btn-secondary" : "btn-primary"} w-full`}>
          {isFav ? "❤️ Ist ein Lieblingsgericht" : "🤍 Als Lieblingsgericht merken"}
        </button>
        <button type="button" onClick={() => setMenu(true)} className="btn-secondary mt-2 w-full">
          🔄 Gericht ändern
        </button>
      </div>
      {menu && <MealActions plan={plan} meal={meal} onClose={() => setMenu(false)} onRemoved={() => router.push("/")} />}

      {warnings.length > 0 && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
          <b>⚠️ Achtung:</b> {warnings.map((w) => `${w.item} – ${w.allergen}`).join("; ")}. Bitte Zutat ersetzen oder weglassen.
        </div>
      )}
      {leftoverSource && (
        <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          ♻️ Reste von „{leftoverSource.name}“ ({DAYS[leftoverSource.dayIndex]}) – einfach aufwärmen.
        </div>
      )}

      {offers.length > 0 && (
        <div className="card mb-4 p-4">
          <h2 className="mb-2 font-semibold">🏷️ Mit Angeboten</h2>
          <ul className="space-y-1 text-sm">
            {offers.map((o) => (
              <li key={o.id} className="flex justify-between gap-2">
                <span>{o.name} <span className="text-stone-500">· {storeName(o.store)}</span></span>
                <span className="font-medium">{euro(o.price)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mb-4 p-4">
        <h2 className="mb-2 font-semibold">🧺 Zutaten</h2>
        <Ingredients items={recipe?.ingredients ?? meal.ingredients.map((i) => ({ amount: `${i.amount ?? ""} ${i.unit}`.trim(), name: i.name }))} />
      </div>

      <div className="card mb-4 p-4">
        <h2 className="mb-3 font-semibold">👩‍🍳 Zubereitung</h2>
        {recipe ? (
          <>
            <Steps recipe={recipe} />
            {demoRecipe?.key !== key && <p className="mt-3 text-xs text-stone-400">📖 Im Rezeptbuch gespeichert – nächstes Mal kostenlos.</p>}
          </>
        ) : failed ? (
          <div className="text-sm">
            <p className="mb-3 text-red-600">{failed}</p>
            <button type="button" className="btn-secondary" onClick={() => setAttempt((a) => a + 1)}>Erneut versuchen</button>
          </div>
        ) : (
          <Loading text="Rezept wird geschrieben …" />
        )}
      </div>
    </div>
  );
}
