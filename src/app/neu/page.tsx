"use client";
import { apiFetch } from "@/lib/sync";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cookbookDishNames, dishKey, getStored, isoDate, mondayOf, useStored, write, euro } from "@/lib/store";
import { DAYS_SHORT, type Plan, type PlanRequest, type WeekSlots } from "@/lib/types";
import { Empty, Header, Loading, Section } from "@/components/ui";

const PRESETS: { label: string; make: () => WeekSlots }[] = [
  { label: "Abends + Wochenende mittags", make: () => DAYS_SHORT.map((_, i) => ({ mittag: i >= 5, abend: true })) },
  { label: "Nur Abendbrot", make: () => DAYS_SHORT.map(() => ({ mittag: false, abend: true })) },
  { label: "Mittag + Abend", make: () => DAYS_SHORT.map(() => ({ mittag: true, abend: true })) },
  { label: "Nur Mittag", make: () => DAYS_SHORT.map(() => ({ mittag: true, abend: false })) },
];

export default function NeuPage() {
  const [profile] = useStored("profile");
  const router = useRouter();
  const weeks = useMemo(() => {
    const now = new Date();
    const thisMon = mondayOf(now);
    const nextMon = new Date(thisMon.getFullYear(), thisMon.getMonth(), thisMon.getDate() + 7);
    const fmt = (d: Date) => d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
    return [
      { value: isoDate(thisMon), label: `Diese Woche (ab ${fmt(thisMon)})` },
      { value: isoDate(nextMon), label: `Nächste Woche (ab ${fmt(nextMon)})` },
    ];
  }, []);
  const [last] = useState<{ budget: number; slots: WeekSlots; favoritesCount?: number } | null>(() => {
    // letzte Einstellungen übernehmen
    try {
      return typeof window === "undefined" ? null : JSON.parse(localStorage.getItem("essensplaner:lastRequest") || "null");
    } catch {
      return null;
    }
  });
  const [budget, setBudget] = useState(last ? String(last.budget) : "60");
  const [weekStart, setWeekStart] = useState(() => {
    // ab Freitag standardmäßig die nächste Woche planen
    return new Date().getDay() >= 5 || new Date().getDay() === 0 ? weeks[1].value : weeks[0].value;
  });
  const [slots, setSlots] = useState<WeekSlots>(last?.slots?.length === 7 ? last.slots : PRESETS[0].make());
  const [favoritesCount, setFavoritesCount] = useState(last?.favoritesCount ?? 2);
  const [wishes, setWishes] = useState("");
  const [status, setStatus] = useState<{ message: string; progress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (profile === undefined) return <Loading />;
  if (profile === null)
    return <Empty icon="👤" title="Zuerst dein Profil" text="Damit die App weiß, was du magst und verträgst." action={<Link href="/profil" className="btn-primary">Profil anlegen</Link>} />;

  const count = slots.reduce((n, s) => n + (s.mittag ? 1 : 0) + (s.abend ? 1 : 0), 0);
  const budgetNum = parseFloat(budget.replace(",", "."));
  const perMeal = count && budgetNum ? budgetNum / count / profile.persons : 0;

  // Kostenschätzung aus den bisherigen Plänen, sonst Erfahrungswert
  const pastCosts = (getStored("plans") ?? []).map((p) => p.aiCostCents).filter((c): c is number => typeof c === "number" && c > 0);
  const estimate = pastCosts.length ? Math.max(1, Math.round(pastCosts.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(5, pastCosts.length))) : 10;

  const askConfirm = () => {
    setError(null);
    if (!budgetNum || budgetNum <= 0) return setError("Bitte ein Budget eingeben.");
    if (!count) return setError("Bitte mindestens eine Mahlzeit auswählen.");
    setConfirming(true);
  };

  const start = async () => {
    setConfirming(false);
    setError(null);
    const cookbook = getStored("cookbook");
    const lastPlan = getStored("plans")[0];
    const req: PlanRequest = {
      profile,
      budget: budgetNum,
      weekStart,
      slots,
      favoritesCount,
      wishes,
      knownDishes: cookbookDishNames(cookbook),
      lastWeekDishes: lastPlan && lastPlan.weekStart !== weekStart ? [...new Set(lastPlan.meals.map((m) => m.name))] : [],
    };
    localStorage.setItem("essensplaner:lastRequest", JSON.stringify({ budget: budgetNum, slots, favoritesCount }));
    setStatus({ message: "Starte …", progress: 2 });
    try {
      const res = await apiFetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...req, confirmed: true }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Fehler ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let plan: Plan | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "status") setStatus({ message: ev.message, progress: ev.progress });
          else if (ev.type === "error") throw new Error(ev.message);
          else if (ev.type === "result") plan = ev.plan;
        }
      }
      if (!plan) throw new Error("Die Verbindung wurde unterbrochen. Bitte erneut versuchen.");
      write("plans", [plan, ...getStored("plans")].slice(0, 20));
      // Wiederverwendete Rezepte zählen (oft genutzte werden bevorzugt vorgeschlagen)
      const cb = { ...getStored("cookbook") };
      for (const m of new Set(plan.meals.map((m) => dishKey(m.name, m.servings)))) if (cb[m]) cb[m] = { ...cb[m], uses: cb[m].uses + 1 };
      write("cookbook", cb);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      setStatus(null);
    }
  };

  if (status)
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <div className="mb-6 animate-bounce text-6xl">🍳</div>
        <h1 className="text-xl font-bold">Dein Wochenplan entsteht</h1>
        <p className="mt-2 mb-6 min-h-[3rem] max-w-xs text-sm text-stone-500">{status.message}</p>
        <div className="h-3 w-64 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div className="h-full rounded-full bg-brand-600 transition-all duration-700" style={{ width: `${Math.max(5, status.progress)}%` }} />
        </div>
        <p className="mt-6 max-w-xs text-xs text-stone-400">Das dauert meist 1–3 Minuten. Bitte die App so lange geöffnet lassen.</p>
      </div>
    );

  return (
    <div>
      <Header title="Neue Woche planen" subtitle="Budget & Mahlzeiten festlegen – den Rest macht die App." />

      <Section title="💶 Budget für die Woche">
        <div className="flex items-center gap-2">
          <input className="input text-2xl font-bold" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Budget in Euro" />
          <span className="text-2xl font-bold text-stone-400">€</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[30, 40, 50, 60, 80, 100].map((b) => (
            <button key={b} type="button" className={budgetNum === b ? "chip-on" : "chip-off"} onClick={() => setBudget(String(b))}>
              {b} €
            </button>
          ))}
        </div>
        {perMeal > 0 && (
          <p className={`mt-3 text-sm ${perMeal < 1.5 ? "text-accent-600" : "text-stone-500"}`}>
            ≈ {euro(perMeal)} pro Portion ({count} Mahlzeiten × {profile.persons} {profile.persons === 1 ? "Person" : "Personen"})
            {perMeal < 1.5 && " – sehr knapp, wird eher einfach."}
          </p>
        )}
      </Section>

      <Section title="📅 Woche">
        <div className="flex flex-col gap-2">
          {weeks.map((w) => (
            <button key={w.value} type="button" className={weekStart === w.value ? "chip-on justify-center py-2.5" : "chip-off justify-center py-2.5"} onClick={() => setWeekStart(w.value)}>
              {w.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="🍽️ Wofür kaufst du ein?" hint="Tippe auf die Felder, um einzelne Mahlzeiten an- oder abzuwählen.">
        <div className="mb-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="chip-off" onClick={() => setSlots(p.make())}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-1 text-center text-xs">
          <div />
          {DAYS_SHORT.map((d, i) => (
            <div key={d} className={`py-1 font-semibold ${i >= 5 ? "text-accent-600" : ""}`}>{d}</div>
          ))}
          {(["mittag", "abend"] as const).map((slot) => (
            <SlotRow key={slot} slot={slot} slots={slots} setSlots={setSlots} />
          ))}
        </div>
      </Section>

      <Section title="✍️ Wünsche (optional)">
        {profile.favoriteDishes.length > 0 && (
          <div className="mb-3">
            <label className="label">Lieblingsgerichte einplanen: <b>{favoritesCount}</b></label>
            <input type="range" min={0} max={Math.min(7, profile.favoriteDishes.length)} value={Math.min(favoritesCount, profile.favoriteDishes.length)} onChange={(e) => setFavoritesCount(Number(e.target.value))} className="w-full accent-brand-600" />
          </div>
        )}
        <textarea className="input" rows={2} value={wishes} onChange={(e) => setWishes(e.target.value)} placeholder="z. B. mehr Gemüse, Freitag Pizza, Donnerstag Gäste" />
      </Section>

      {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

      <button type="button" className="btn-primary mb-4 w-full py-4 text-lg" onClick={askConfirm}>
        ✨ Plan & Einkaufsliste erstellen
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" onClick={() => setConfirming(false)}>
          <div className="card w-full max-w-sm p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="text-center text-4xl">💶</div>
            <h2 className="mt-2 text-center text-lg font-bold">Neuen Wochenplan erstellen?</h2>
            <p className="mt-2 text-center text-sm text-stone-600 dark:text-stone-400">
              Die KI plant {count} Mahlzeiten mit den aktuellen Angeboten. Das kostet einmalig ca. <b>{estimate} Cent</b> KI-Guthaben
              {pastCosts.length ? " (Schnitt eurer letzten Pläne)" : ""}.
            </p>
            <p className="mt-2 text-center text-xs text-stone-500">Rezepte aus dem Rezeptbuch sind danach kostenlos, neue kosten ca. 1 Cent beim ersten Öffnen.</p>
            <div className="mt-5 flex flex-col gap-2">
              <button type="button" className="btn-primary w-full" onClick={start}>
                Ja, Plan erstellen (ca. {estimate} ct)
              </button>
              <button type="button" className="btn-secondary w-full" onClick={() => setConfirming(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotRow({ slot, slots, setSlots }: { slot: "mittag" | "abend"; slots: WeekSlots; setSlots: (s: WeekSlots) => void }) {
  return (
    <>
      <div className="flex items-center pr-1 text-left font-medium">{slot === "mittag" ? "Mittag" : "Abend"}</div>
      {slots.map((s, i) => (
        <button
          key={i}
          type="button"
          aria-label={`${DAYS_SHORT[i]} ${slot}`}
          aria-pressed={s[slot]}
          onClick={() => setSlots(slots.map((x, j) => (j === i ? { ...x, [slot]: !x[slot] } : x)))}
          className={`aspect-square rounded-lg text-base transition ${s[slot] ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-300 dark:bg-stone-800 dark:text-stone-600"}`}
        >
          {s[slot] ? "✓" : "–"}
        </button>
      ))}
    </>
  );
}
