"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { euro, useStored } from "@/lib/store";
import { useCurrentPlan } from "@/lib/usePlan";
import { CATEGORIES, storeName } from "@/lib/constants";
import type { ShoppingItem } from "@/lib/types";
import { Empty, Header, Loading } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Einkauf />
    </Suspense>
  );
}

function Einkauf() {
  const { plan } = useCurrentPlan();
  const [checkedAll, setCheckedAll] = useStored("checked");
  const [hideDone, setHideDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const groups = useMemo(() => {
    if (!plan) return [];
    const byStore = new Map<string, ShoppingItem[]>();
    for (const s of plan.shopping) byStore.set(s.store, [...(byStore.get(s.store) ?? []), s]);
    return [...byStore.entries()]
      .sort(([a], [b]) => (a === "egal" ? 1 : b === "egal" ? -1 : 0))
      .map(([store, items]) => ({
        store,
        total: items.reduce((n, s) => n + s.price, 0),
        items: [...items].sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)),
      }));
  }, [plan]);

  if (plan === undefined || checkedAll === undefined) return <Loading />;
  if (!plan) return <Empty icon="🛒" title="Keine Einkaufsliste" text="Erstelle zuerst einen Wochenplan." action={<Link href="/neu" className="btn-primary">Woche planen</Link>} />;

  const checked = new Set(checkedAll[plan.id] ?? []);
  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedAll({ ...checkedAll, [plan.id]: [...next] });
  };
  const done = plan.shopping.filter((s) => checked.has(s.id)).length;
  const estimates = plan.shopping.some((s) => s.priceIsEstimate);

  const copy = async () => {
    const text = groups
      .map((g) => `${storeName(g.store)} (${euro(g.total)})\n` + g.items.map((s) => `${checked.has(s.id) ? "☑" : "☐"} ${s.name} – ${s.quantity}`).join("\n"))
      .join("\n\n");
    const full = `Einkaufsliste (${euro(plan.total)})\n\n${text}`;
    try {
      if (navigator.share) await navigator.share({ title: "Einkaufsliste", text: full });
      else {
        await navigator.clipboard.writeText(full);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  return (
    <div>
      <Header title="Einkaufsliste" subtitle={`${done} von ${plan.shopping.length} erledigt`} right={<button type="button" className="btn-secondary px-3 py-2 text-sm" onClick={copy}>{copied ? "✓ Kopiert" : "📤 Teilen"}</button>} />

      <div className="card mb-4 grid grid-cols-3 divide-x divide-stone-100 p-3 text-center dark:divide-stone-800">
        <div>
          <div className="text-xs text-stone-500">Summe</div>
          <div className={`text-lg font-bold ${plan.total > plan.budget ? "text-red-600" : ""}`}>{euro(plan.total)}</div>
        </div>
        <div>
          <div className="text-xs text-stone-500">Budget</div>
          <div className="text-lg font-bold">{euro(plan.budget)}</div>
        </div>
        <div>
          <div className="text-xs text-stone-500">Gespart</div>
          <div className="text-lg font-bold text-brand-600">{euro(plan.savings)}</div>
        </div>
      </div>

      <label className="mb-3 flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
        Erledigte ausblenden
      </label>

      <div className="space-y-4">
        {groups.map((g) => {
          const items = hideDone ? g.items.filter((s) => !checked.has(s.id)) : g.items;
          if (!items.length) return null;
          return (
            <div key={g.store}>
              <h2 className="mb-2 flex justify-between text-sm font-semibold uppercase tracking-wide text-stone-500">
                <span>🏪 {storeName(g.store)}</span>
                <span>{euro(g.total)}</span>
              </h2>
              <div className="card divide-y divide-stone-100 dark:divide-stone-800">
                {items.map((s) => {
                  const on = checked.has(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => toggle(s.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm ${on ? "border-brand-600 bg-brand-600 text-white" : "border-stone-300 dark:border-stone-600"}`}>{on ? "✓" : ""}</span>
                      <span className={`min-w-0 flex-1 ${on ? "text-stone-400 line-through" : ""}`}>
                        <span className="block font-medium">{s.name}</span>
                        <span className="block text-xs text-stone-500">{s.quantity} · {s.category}</span>
                      </span>
                      <span className="text-right text-sm">
                        <span className="block font-semibold">{s.priceIsEstimate ? "~" : ""}{euro(s.price)}</span>
                        {s.regularPrice && <span className="block text-xs text-stone-400 line-through">{euro(s.regularPrice)}</span>}
                        {s.offerId && <span className="mt-0.5 inline-block rounded bg-accent-500 px-1.5 text-[10px] font-bold text-white">ANGEBOT</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {estimates && <p className="mt-4 text-xs text-stone-500">~ = geschätzter Normalpreis. Angebotspreise stammen aus den aktuellen Prospekten.</p>}
    </div>
  );
}
