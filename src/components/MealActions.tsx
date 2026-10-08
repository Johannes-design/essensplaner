"use client";
import { useState } from "react";
import { cookbookDishNames, getStored, useStored, write } from "@/lib/store";
import { apiFetch } from "@/lib/sync";
import { moveMeal, remapChecked, removeMeal } from "@/lib/planEdit";
import { DAYS, DAYS_SHORT, type Meal, type Plan, type Slot } from "@/lib/types";

type View = "menu" | "swap" | "move" | "remove" | "working" | "done";

function savePlan(before: Plan, after: Plan) {
  write("plans", getStored("plans").map((p) => (p.id === before.id ? after : p)));
  const checked = getStored("checked");
  if (checked[before.id]?.length) write("checked", { ...checked, [before.id]: remapChecked(before, after, checked[before.id]) });
}

/** Menü zum Ändern eines Gerichts (Tauschen per KI, Tag tauschen, Streichen). */
export default function MealActions({ plan, meal, onClose, onRemoved }: { plan: Plan; meal: Meal; onClose: () => void; onRemoved?: () => void }) {
  const [profile] = useStored("profile");
  const [cookbook] = useStored("cookbook");
  const [view, setView] = useState<View>("menu");
  const [wish, setWish] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const known = cookbookDishNames(cookbook ?? {}).filter((n) => n.toLowerCase() !== meal.name.toLowerCase());

  const swap = async () => {
    if (!profile) return;
    setView("working");
    setError(null);
    try {
      const res = await apiFetch("/api/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, mealId: meal.id, wish, profile, knownDishes: cookbookDishNames(getStored("cookbook")), confirmed: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Tauschen fehlgeschlagen");
      savePlan(plan, j.plan);
      const newMeal = (j.plan as Plan).meals.find((m) => m.id === meal.id);
      setNote(`${newMeal?.emoji ?? ""} ${newMeal?.name ?? "Neues Gericht"} – ${j.note ?? "Einkaufsliste angepasst."}`);
      setView("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
      setView("swap");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" onClick={view === "working" ? undefined : onClose}>
      <div className="card max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <span className="text-3xl">{meal.emoji || "🍽️"}</span>
          <div className="min-w-0">
            <div className="text-xs text-stone-500">{DAYS[meal.dayIndex]} · {meal.slot === "mittag" ? "Mittag" : "Abendbrot"}</div>
            <div className="truncate font-semibold">{meal.name}</div>
          </div>
        </div>

        {view === "menu" && (
          <div className="flex flex-col gap-2">
            <button type="button" className="btn-primary w-full justify-start" onClick={() => setView("swap")}>🔄 Anderes Gericht vorschlagen</button>
            <button type="button" className="btn-secondary w-full justify-start" onClick={() => setView("move")}>📅 Mit anderem Tag tauschen</button>
            <button type="button" className="btn-secondary w-full justify-start text-red-600" onClick={() => setView("remove")}>🗑️ Gericht streichen</button>
            <button type="button" className="btn-secondary w-full" onClick={onClose}>Abbrechen</button>
          </div>
        )}

        {view === "swap" && (
          <div>
            <label className="label" htmlFor="wish">Worauf hast du stattdessen Lust? (optional)</label>
            <textarea id="wish" className="input" rows={2} value={wish} onChange={(e) => setWish(e.target.value)} placeholder="z. B. lieber was mit Reis, ohne Ofen, etwas Leichtes" />
            {known.length > 0 && (
              <>
                <p className="mt-3 mb-1.5 text-sm text-stone-500">Oder aus dem Rezeptbuch:</p>
                <div className="flex flex-wrap gap-1.5">
                  {known.slice(0, 12).map((n) => (
                    <button key={n} type="button" className={wish === n ? "chip-on" : "chip-off"} onClick={() => setWish(n)}>
                      📖 {n}
                    </button>
                  ))}
                </div>
              </>
            )}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <p className="mt-4 text-center text-xs text-stone-500">Die KI sucht ein neues Gericht und passt die Einkaufsliste an. Das kostet ca. 2 Cent.</p>
            <div className="mt-2 flex flex-col gap-2">
              <button type="button" className="btn-primary w-full" onClick={swap}>Ja, tauschen (ca. 2 ct)</button>
              <button type="button" className="btn-secondary w-full" onClick={() => setView("menu")}>Zurück</button>
            </div>
          </div>
        )}

        {view === "move" && (
          <div>
            <p className="mb-3 text-sm text-stone-500">Wohin soll das Gericht? Ist der Platz belegt, tauschen beide Gerichte. Kostenlos.</p>
            <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-1 text-center text-xs">
              <div />
              {DAYS_SHORT.map((d) => <div key={d} className="py-1 font-semibold">{d}</div>)}
              {(["mittag", "abend"] as Slot[]).map((slot) => (
                <MoveRow key={slot} slot={slot} plan={plan} meal={meal} onPick={(day) => {
                  savePlan(plan, moveMeal(plan, meal.id, day, slot));
                  onClose();
                }} />
              ))}
            </div>
            <button type="button" className="btn-secondary mt-4 w-full" onClick={() => setView("menu")}>Zurück</button>
          </div>
        )}

        {view === "remove" && (
          <div>
            <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">„{meal.name}“ aus dem Plan streichen? Zutaten, die nur dafür gekauft würden, werden von der Einkaufsliste entfernt.</p>
            <div className="flex flex-col gap-2">
              <button type="button" className="btn-primary w-full bg-red-600 hover:bg-red-700" onClick={() => {
                savePlan(plan, removeMeal(plan, meal.id));
                onClose();
                onRemoved?.();
              }}>Ja, streichen</button>
              <button type="button" className="btn-secondary w-full" onClick={() => setView("menu")}>Zurück</button>
            </div>
          </div>
        )}

        {view === "working" && (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600" />
            <p className="text-sm text-stone-500">Suche ein neues Gericht und passe die Einkaufsliste an …</p>
          </div>
        )}

        {view === "done" && (
          <div className="text-center">
            <div className="text-4xl">✅</div>
            <p className="mt-2 text-sm">{note}</p>
            <button type="button" className="btn-primary mt-4 w-full" onClick={onClose}>Fertig</button>
          </div>
        )}
      </div>
    </div>
  );
}

function MoveRow({ slot, plan, meal, onPick }: { slot: Slot; plan: Plan; meal: Meal; onPick: (day: number) => void }) {
  return (
    <>
      <div className="flex items-center pr-1 text-left font-medium">{slot === "mittag" ? "Mittag" : "Abend"}</div>
      {DAYS_SHORT.map((d, i) => {
        const here = plan.meals.find((m) => m.dayIndex === i && m.slot === slot);
        const self = here?.id === meal.id;
        return (
          <button key={d} type="button" disabled={self} onClick={() => onPick(i)} aria-label={`${d} ${slot}${here ? `: ${here.name}` : ""}`}
            className={`aspect-square rounded-lg text-lg ${self ? "bg-brand-600 text-white" : here ? "bg-stone-100 dark:bg-stone-800" : "border border-dashed border-stone-300 dark:border-stone-700"}`}>
            {here ? here.emoji || "🍽️" : ""}
          </button>
        );
      })}
    </>
  );
}
