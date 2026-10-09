"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/sync";
import { useSession } from "@/components/HouseholdGate";
import { Empty, Header, Loading, Section } from "@/components/ui";

interface Row {
  name: string;
  householdId: string;
  createdAt: string | null;
  main: boolean;
  costs: Record<string, number>;
}

const month = (offset = 0) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 7);
};
const monthLabel = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
// Kosten werden in US-Cent erfasst; grob in Euro umgerechnet
const USD_EUR = 0.92;
const euroFromCents = (c: number) => ((c * USD_EUR) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

export default function Verwaltung() {
  const session = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState(randomPin);
  const [created, setCreated] = useState<{ name: string; pin: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin");
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || "Fehler beim Laden");
    return j.accounts as Row[];
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [load]);

  const act = async (body: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Fehler");
      setRows(await load());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!session) return <Loading />;
  if (!session.isAdmin) return <Empty icon="🔒" title="Nur für Johannes" text="Diese Seite ist nur im Haupt-Haushalt verfügbar." action={<Link href="/" className="btn-primary">Zur Woche</Link>} />;

  const appUrl = typeof window === "undefined" ? "" : window.location.origin;
  const share = async (n: string, p: string) => {
    const text = `Hier ist dein Zugang zu Kochfaul 🥘\n${appUrl}\nName: ${n}\nCode: ${p}\n\nTipp: In Safari öffnen → Teilen → „Zum Home-Bildschirm“.`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
    } catch {}
  };

  const totalThis = rows?.reduce((n, r) => n + (r.costs[month()] ?? 0), 0) ?? 0;

  return (
    <div>
      <Link href="/profil" className="mb-3 inline-block text-sm text-brand-600">‹ Profil</Link>
      <Header title="Zugänge & Kosten" subtitle="Jeder Zugang hat ein eigenes Profil, eigene Pläne und eine eigene Einkaufsliste." />

      {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

      <Section title="➕ Neuer Zugang">
        {created ? (
          <div className="text-center">
            <p className="text-sm">Zugang für <b>{created.name}</b> angelegt. Code: <b className="text-lg tracking-widest">{created.pin}</b></p>
            <p className="mt-1 text-xs text-stone-500">Merk dir den Code – er wird aus Sicherheitsgründen nur jetzt angezeigt.</p>
            <div className="mt-3 flex flex-col gap-2">
              <button type="button" className="btn-primary w-full" onClick={() => share(created.name, created.pin)}>📤 Zugangsdaten schicken</button>
              <button type="button" className="btn-secondary w-full" onClick={() => { setCreated(null); setName(""); setPin(randomPin()); }}>Fertig</button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: "create", name, pin })) setCreated({ name: name.trim(), pin });
            }}
          >
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <div>
                <label className="label" htmlFor="acc-name">Name</label>
                <input id="acc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Emily" />
              </div>
              <div>
                <label className="label" htmlFor="acc-pin">Code</label>
                <input id="acc-pin" className="input text-center tracking-widest" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
              </div>
            </div>
            <button type="submit" className="btn-primary mt-3 w-full" disabled={busy || !name.trim() || pin.length < 4}>Zugang anlegen</button>
          </form>
        )}
      </Section>

      <Section title="💶 KI-Kosten" hint={`Diesen Monat insgesamt ca. ${euroFromCents(totalThis)}. Werte sind grob in Euro umgerechnet.`}>
        {!rows ? (
          <Loading />
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            <div className="grid grid-cols-[1fr_5.5rem_5.5rem] gap-2 pb-2 text-xs text-stone-500">
              <span />
              <span className="text-right">{monthLabel(month()).split(" ")[0]}</span>
              <span className="text-right">{monthLabel(month(-1)).split(" ")[0]}</span>
            </div>
            {rows.map((r) => (
              <div key={r.householdId} className="py-3">
                <div className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-right font-semibold">{euroFromCents(r.costs[month()] ?? 0)}</span>
                  <span className="text-right text-stone-500">{euroFromCents(r.costs[month(-1)] ?? 0)}</span>
                </div>
                {!r.main && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="chip-off"
                      disabled={busy}
                      onClick={async () => {
                        const p = prompt(`Neuen Code für ${r.name} (4–8 Ziffern):`, randomPin());
                        if (p && (await act({ action: "setPin", name: r.name, pin: p }))) share(r.name, p);
                      }}
                    >
                      🔑 Neuer Code
                    </button>
                    <button
                      type="button"
                      className="chip-off text-red-600"
                      disabled={busy}
                      onClick={() => confirm(`Zugang von ${r.name} löschen? ${r.name} kann sich dann nicht mehr anmelden.`) && act({ action: "delete", name: r.name })}
                    >
                      🗑️ Löschen
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
