"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStored } from "@/lib/store";
import { Empty, Header, Loading } from "@/components/ui";
import { Ingredients, Steps } from "@/components/RecipeView";

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Rezeptbuch />
    </Suspense>
  );
}

function Rezeptbuch() {
  const [cookbook, setCookbook] = useStored("cookbook");
  const [profile, setProfile] = useStored("profile");
  const [q, setQ] = useState("");
  const key = useSearchParams().get("key");
  const entries = useMemo(
    () =>
      Object.values(cookbook ?? {})
        .filter((e) => !q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    [cookbook, q],
  );
  if (cookbook === undefined || profile === undefined) return <Loading />;

  const entry = key ? cookbook[key] : undefined;
  if (entry) {
    const isFav = !!profile?.favoriteDishes.some((f) => f.toLowerCase() === entry.name.toLowerCase());
    return (
      <div>
        <Link href="/rezepte" className="mb-3 inline-block text-sm text-brand-600">‹ Rezeptbuch</Link>
        <div className="card mb-4 p-5 text-center">
          <div className="text-6xl">{entry.emoji || "🍽️"}</div>
          <h1 className="mt-2 text-2xl font-bold">{entry.recipe.title || entry.name}</h1>
          <p className="mt-1 text-sm text-stone-500">{entry.description}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm">
            <span className="chip-off">⏱ {entry.recipe.totalMinutes} Min.</span>
            <span className="chip-off">👥 {entry.recipe.servings} Portionen</span>
            <span className="chip-off">🔁 {entry.uses}× gekocht</span>
          </div>
          {profile && (
            <button
              type="button"
              className={`mt-4 w-full ${isFav ? "btn-secondary" : "btn-primary"}`}
              onClick={() =>
                setProfile({
                  ...profile,
                  favoriteDishes: isFav ? profile.favoriteDishes.filter((f) => f.toLowerCase() !== entry.name.toLowerCase()) : [...profile.favoriteDishes, entry.name],
                })
              }
            >
              {isFav ? "❤️ Ist ein Lieblingsgericht" : "🤍 Als Lieblingsgericht merken"}
            </button>
          )}
        </div>
        <div className="card mb-4 p-4">
          <h2 className="mb-2 font-semibold">🧺 Zutaten</h2>
          <Ingredients items={entry.recipe.ingredients} />
        </div>
        <div className="card mb-4 p-4">
          <h2 className="mb-3 font-semibold">👩‍🍳 Zubereitung</h2>
          <Steps recipe={entry.recipe} />
        </div>
        <button
          type="button"
          className="btn-secondary mb-4 w-full text-red-600"
          onClick={() => {
            if (!confirm(`„${entry.name}“ aus dem Rezeptbuch löschen?`)) return;
            const next = { ...cookbook };
            delete next[entry.key];
            setCookbook(next);
            history.back();
          }}
        >
          🗑️ Aus Rezeptbuch löschen
        </button>
      </div>
    );
  }

  const count = Object.keys(cookbook).length;
  return (
    <div>
      <Header title="Rezeptbuch" subtitle={`${count} ${count === 1 ? "gespeichertes Rezept" : "gespeicherte Rezepte"} – werden kostenlos wiederverwendet`} />
      {count === 0 ? (
        <Empty icon="📖" title="Noch leer" text="Jedes Rezept, das du im Wochenplan öffnest, wird hier gespeichert. Neue Pläne nutzen bekannte Gerichte bevorzugt – das spart KI-Kosten." action={<Link href="/" className="btn-primary">Zur Woche</Link>} />
      ) : (
        <>
          <input className="input mb-3" placeholder="🔍 Rezept suchen" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="card divide-y divide-stone-100 dark:divide-stone-800">
            {entries.map((e) => (
              <Link key={e.key} href={`/rezepte?key=${encodeURIComponent(e.key)}`} className="flex items-center gap-3 px-3 py-3">
                <span className="text-2xl">{e.emoji || "🍽️"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.name}</span>
                  <span className="block text-xs text-stone-500">⏱ {e.recipe.totalMinutes} Min. · {e.recipe.servings} Portionen · {e.uses}× gekocht</span>
                </span>
                <span className="text-stone-300">›</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
