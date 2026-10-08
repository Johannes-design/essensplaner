"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { euro, getStored, useStored, write } from "@/lib/store";
import { useCurrentPlan } from "@/lib/usePlan";
import { storeName } from "@/lib/constants";
import { DAYS, type Recipe } from "@/lib/types";
import { Empty, Loading } from "@/components/ui";

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
  const [recipes] = useStored("recipes");
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const meal = plan?.meals.find((m) => m.id === id);
  const key = plan && meal ? `${plan.id}:${meal.id}` : "";
  const recipe: Recipe | undefined = recipes?.[key];

  const needsRecipe = recipes !== undefined && !!meal && !!profile && !recipe;
  const failed = error?.key === `${key}#${attempt}` ? error.message : null;

  useEffect(() => {
    if (!needsRecipe || !meal || !profile) return;
    let cancelled = false;
    const tag = `${key}#${attempt}`;
    fetch("/api/recipe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ meal, profile }) })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Rezept konnte nicht geladen werden");
        if (!cancelled) write("recipes", { ...getStored("recipes"), [key]: j.recipe });
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
      </div>

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
        <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
          {(recipe?.ingredients ?? meal.ingredients.map((i) => ({ amount: `${i.amount ?? ""} ${i.unit}`.trim(), name: i.name }))).map((i, n) => (
            <li key={n} className="flex gap-3 py-1.5">
              <span className="w-24 shrink-0 text-right font-medium text-stone-600 dark:text-stone-400">{i.amount}</span>
              <span>{i.name}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card mb-4 p-4">
        <h2 className="mb-3 font-semibold">👩‍🍳 Zubereitung</h2>
        {recipe ? (
          <>
            <ol className="space-y-4">
              {recipe.steps.map((s, n) => (
                <li key={n} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{n + 1}</span>
                  <div className="pt-0.5 text-[15px] leading-relaxed">
                    {s.text}
                    {s.minutes ? <span className="ml-1 text-xs text-stone-500">({s.minutes} Min.)</span> : null}
                  </div>
                </li>
              ))}
            </ol>
            {recipe.tips.length > 0 && (
              <div className="mt-4 rounded-xl bg-stone-50 p-3 text-sm dark:bg-stone-800/60">
                <b>💡 Tipps:</b>
                <ul className="mt-1 list-disc pl-5">{recipe.tips.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}
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
