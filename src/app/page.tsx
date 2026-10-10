"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useStored, euro, dayDate, findInCookbook } from "@/lib/store";
import { useCurrentPlan } from "@/lib/usePlan";
import { DAYS, type Meal, type Plan } from "@/lib/types";
import { Empty, Header, Loading } from "@/components/ui";
import MealActions from "@/components/MealActions";
import { useLongPress } from "@/lib/useLongPress";

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <Week />
    </Suspense>
  );
}

function Week() {
  const [profile] = useStored("profile");
  const { plan, plans } = useCurrentPlan();
  if (profile === undefined || plan === undefined) return <Loading />;
  if (profile === null)
    return (
      <div className="pt-6">
        <div className="mb-6 text-center">
          <div className="text-6xl">🥘</div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Kochfaul</h1>
          <p className="mt-2 text-stone-500">Budget eingeben – fertig ist dein Essensplan für die Woche. Mit den aktuellen Angeboten aus Stralsund, Einkaufsliste und Rezepten.</p>
        </div>
        <ul className="card mb-6 space-y-3 p-5 text-sm">
          <li>🏷️ Nutzt die Prospekt-Angebote von Aldi, Lidl, Rewe & Co.</li>
          <li>💶 Bleibt in deinem Budget – und spart wo es geht</li>
          <li>⚠️ Beachtet Allergien & Unverträglichkeiten</li>
          <li>❤️ Plant deine Lieblingsgerichte immer wieder ein</li>
          <li>👩‍🍳 Einfache Rezepte mit Schritt-für-Schritt-Anleitung</li>
        </ul>
        <Link href="/profil" className="btn-primary w-full py-4 text-lg">Los geht&apos;s</Link>
      </div>
    );
  if (!plan)
    return (
      <>
        <Header title={profile.name ? `Hallo ${profile.name}!` : "Hallo!"} />
        <Empty icon="✨" title="Noch kein Wochenplan" text="Lege dein Budget fest und lass dir Gerichte und Einkaufsliste erstellen." action={<Link href="/neu" className="btn-primary">Woche planen</Link>} />
      </>
    );

  return (
    <div>
      <Header
        title="Dein Wochenplan"
        subtitle={`Woche ab ${dayDate(plan.weekStart, 0)} · ${plan.persons} ${plan.persons === 1 ? "Person" : "Personen"}${plan.shoppingDate ? ` · Einkauf ${new Date(`${plan.shoppingDate}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" })}` : ""}`}
        right={<Link href="/neu" className="btn-secondary px-3 py-2 text-sm">＋ Neu</Link>}
      />
      <BudgetCard plan={plan} />
      {plan.demo && <Notice tone="info">Demo-Modus: Es werden Beispieldaten angezeigt.</Notice>}
      {plan.offerSource === "keine" && <Notice tone="warn">Diese Woche konnten keine Prospekt-Angebote geladen werden – die Preise sind geschätzt.</Notice>}
      {plan.offerSource === "websuche" && <Notice tone="info">Die Angebote wurden per Websuche gefunden. Preise bitte im Laden kurz prüfen.</Notice>}
      {plan.warnings.length > 0 && (
        <Notice tone="danger">
          <b>Bitte prüfen:</b> {plan.warnings.map((w) => `${w.item} (${w.allergen})`).join(", ")}
        </Notice>
      )}
      <p className="mb-2 text-sm text-stone-600 dark:text-stone-400">{plan.summary}</p>
      <p className="mb-4 text-xs text-stone-400">Tipp: Gericht gedrückt halten, um es zu tauschen, zu verschieben oder zu streichen.</p>

      <div className="space-y-4">
        {DAYS.map((day, i) => {
          const meals = plan.meals.filter((m) => m.dayIndex === i);
          if (!meals.length) return null;
          return (
            <div key={day}>
              <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
                {day} <span className="font-normal normal-case">{dayDate(plan.weekStart, i)}</span>
              </h2>
              <div className="space-y-2">
                {meals.map((m) => (
                  <MealCard key={m.id} meal={m} plan={plan} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {plan.tips.length > 0 && (
        <div className="card mt-6 p-4">
          <h2 className="mb-2 font-semibold">💡 Tipps für diese Woche</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600 dark:text-stone-400">
            {plan.tips.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between text-sm text-stone-500">
        <Link href="/rezepte" className="font-medium text-brand-600">📖 Mein Rezeptbuch →</Link>
        {plan.aiCostCents != null && <span>KI-Kosten: ca. {plan.aiCostCents.toFixed(1).replace(".", ",")} ct</span>}
      </div>

      {plans && plans.length > 1 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Frühere Pläne</h2>
          <div className="card divide-y divide-stone-100 dark:divide-stone-800">
            {plans.map((p) => (
              <Link key={p.id} href={p.id === plans[0].id ? "/" : `/?plan=${p.id}`} className={`flex justify-between px-4 py-3 text-sm ${p.id === plan.id ? "font-semibold text-brand-600" : ""}`}>
                <span>Woche ab {dayDate(p.weekStart, 0)} · {p.meals.length} Gerichte</span>
                <span>{euro(p.total)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetCard({ plan }: { plan: Plan }) {
  const pct = Math.min(100, (plan.total / plan.budget) * 100);
  const over = plan.total > plan.budget;
  return (
    <Link href={`/einkauf${plan.id ? `?plan=${plan.id}` : ""}`} className="card mb-4 block p-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-stone-500">Einkauf</div>
          <div className={`text-3xl font-bold ${over ? "text-red-600" : ""}`}>{euro(plan.total)}</div>
          <div className="text-sm text-stone-500">von {euro(plan.budget)} Budget</div>
        </div>
        <div className="text-right">
          {plan.savings > 0 && <div className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 dark:bg-brand-700/20 dark:text-brand-500">−{euro(plan.savings)} gespart</div>}
          {!over && plan.budget - plan.total >= 1 && <div className="mt-1 text-sm text-stone-500">{euro(plan.budget - plan.total)} übrig</div>}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-brand-600"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-right text-sm font-medium text-brand-600">Zur Einkaufsliste →</div>
    </Link>
  );
}

function MealCard({ meal, plan }: { meal: Meal; plan: Plan }) {
  const [cookbook] = useStored("cookbook");
  const [menu, setMenu] = useState(false);
  const press = useLongPress(() => setMenu(true));
  const known = !!findInCookbook(cookbook, meal.name, meal.servings);
  const warn = plan.warnings.some((w) => w.mealId === meal.id);
  return (
    <>
    <Link
      href={`/gericht?plan=${plan.id}&id=${encodeURIComponent(meal.id)}`}
      {...press}
      style={{ WebkitTouchCallout: "none" }}
      className={`card flex select-none items-center gap-3 p-3 active:bg-stone-50 dark:active:bg-stone-800 ${warn ? "ring-2 ring-red-400" : ""}`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-2xl dark:bg-stone-800">{meal.emoji || "🍽️"}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-stone-500">
          {meal.slot === "mittag" ? "Mittag" : "Abendbrot"}
          {meal.leftoverOf && " · Reste"}
          {meal.isFavorite && " · ❤️"}
        </div>
        <div className="truncate font-semibold">{meal.name}</div>
        <div className="text-xs text-stone-500">⏱ {meal.prepMinutes} Min. · ca. {euro(meal.estimatedCost)}{meal.offerIds.length > 0 && " · 🏷️ Angebot"}{known && " · 📖"}</div>
      </div>
      <span className="text-stone-300">›</span>
    </Link>
    {menu && <MealActions plan={plan} meal={meal} onClose={() => setMenu(false)} />}
    </>
  );
}

function Notice({ tone, children }: { tone: "info" | "warn" | "danger"; children: React.ReactNode }) {
  const cls = {
    info: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
    warn: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    danger: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  }[tone];
  return <div className={`mb-4 rounded-xl p-3 text-sm ${cls}`}>{children}</div>;
}
