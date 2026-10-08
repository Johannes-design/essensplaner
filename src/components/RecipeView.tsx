import type { Recipe } from "@/lib/types";

export function Ingredients({ items }: { items: { amount: string; name: string }[] }) {
  return (
    <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
      {items.map((i, n) => (
        <li key={n} className="flex gap-3 py-1.5">
          <span className="w-24 shrink-0 text-right font-medium text-stone-600 dark:text-stone-400">{i.amount}</span>
          <span>{i.name}</span>
        </li>
      ))}
    </ul>
  );
}

export function Steps({ recipe }: { recipe: Recipe }) {
  return (
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
  );
}
