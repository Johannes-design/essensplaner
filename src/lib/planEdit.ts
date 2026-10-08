import type { Plan, Slot } from "./types";

const round = (n: number) => Math.round(n * 100) / 100;

function totals(plan: Plan): Plan {
  const total = round(plan.shopping.reduce((n, s) => n + s.price, 0));
  const savings = round(plan.shopping.reduce((n, s) => n + (s.regularPrice ? s.regularPrice - s.price : 0), 0));
  return { ...plan, total, savings };
}

/** Gericht streichen: Zutaten, die nur dafür gekauft wurden, fliegen von der Liste. */
export function removeMeal(plan: Plan, mealId: string): Plan {
  const shopping = plan.shopping
    .filter((s) => !(s.forMeals.length > 0 && s.forMeals.every((id) => id === mealId)))
    .map((s) => ({ ...s, forMeals: s.forMeals.filter((id) => id !== mealId) }));
  return totals({
    ...plan,
    meals: plan.meals.filter((m) => m.id !== mealId).map((m) => (m.leftoverOf === mealId ? { ...m, leftoverOf: null } : m)),
    shopping,
    warnings: plan.warnings.filter((w) => w.mealId !== mealId),
  });
}

/** Gericht auf einen anderen Tag/Slot legen; ist der belegt, tauschen beide. */
export function moveMeal(plan: Plan, mealId: string, dayIndex: number, slot: Slot): Plan {
  const meal = plan.meals.find((m) => m.id === mealId);
  if (!meal) return plan;
  const other = plan.meals.find((m) => m.dayIndex === dayIndex && m.slot === slot);
  const meals = plan.meals
    .map((m) => {
      if (m.id === mealId) return { ...m, dayIndex, slot };
      if (other && m.id === other.id) return { ...m, dayIndex: meal.dayIndex, slot: meal.slot };
      return m;
    })
    .sort((a, b) => a.dayIndex - b.dayIndex || (a.slot === "mittag" ? -1 : 1));
  return { ...plan, meals };
}

/** Nach einem Tausch die Häkchen über den Produktnamen übernehmen. */
export function remapChecked(before: Plan, after: Plan, checked: string[]): string[] {
  const names = new Set(before.shopping.filter((s) => checked.includes(s.id)).map((s) => s.name.toLowerCase()));
  return after.shopping.filter((s) => names.has(s.name.toLowerCase())).map((s) => s.id);
}
