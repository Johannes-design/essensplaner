"use client";
import { useEffect, useMemo, useState } from "react";
import { euro, useStored } from "@/lib/store";
import { STORES } from "@/lib/constants";
import type { Offer } from "@/lib/types";
import { Header, Loading } from "@/components/ui";

export default function AngebotePage() {
  const [profile] = useStored("profile");
  const [res, setRes] = useState<{ url: string; data?: { offers: Offer[]; note: string; source: string }; error?: string } | null>(null);
  const [q, setQ] = useState("");
  const [store, setStore] = useState<string>("alle");
  const [onlyDiscount, setOnlyDiscount] = useState(true);

  const zip = profile?.zipCode || "18435";
  const stores = profile?.stores.join(",") || STORES.map((s) => s.key).join(",");

  const url = `/api/offers?zip=${zip}&stores=${stores}`;
  useEffect(() => {
    if (profile === undefined) return;
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((j) => !cancelled && setRes({ url, data: j }))
      .catch(() => !cancelled && setRes({ url, error: "Angebote konnten nicht geladen werden." }));
    return () => {
      cancelled = true;
    };
  }, [profile, url]);
  const data = res?.url === url ? (res.data ?? null) : null;
  const error = res?.url === url ? (res.error ?? null) : null;

  const list = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    return data.offers
      .filter((o) => store === "alle" || o.store === store)
      .filter((o) => !onlyDiscount || o.oldPrice)
      .filter((o) => !t || `${o.product} ${o.brand ?? ""} ${o.description ?? ""}`.toLowerCase().includes(t))
      .sort((a, b) => (b.oldPrice ? (b.oldPrice - b.price) / b.oldPrice : 0) - (a.oldPrice ? (a.oldPrice - a.price) / a.oldPrice : 0));
  }, [data, q, store, onlyDiscount]);

  const storesWithOffers = STORES.filter((s) => data?.offers.some((o) => o.store === s.key));

  return (
    <div>
      <Header title="Angebote" subtitle={`Aktuelle Prospekte für ${zip}`} />
      <input className="input mb-3" placeholder="🔍 Suchen, z. B. Hähnchen" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <button type="button" className={store === "alle" ? "chip-on shrink-0" : "chip-off shrink-0"} onClick={() => setStore("alle")}>Alle</button>
        {storesWithOffers.map((s) => (
          <button key={s.key} type="button" className={store === s.key ? "chip-on shrink-0" : "chip-off shrink-0"} onClick={() => setStore(s.key)}>{s.name}</button>
        ))}
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={onlyDiscount} onChange={(e) => setOnlyDiscount(e.target.checked)} />
        Nur reduzierte Artikel
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <Loading text="Lade Prospekte …" />}
      {data && data.offers.length === 0 && (
        <div className="card p-4 text-sm text-stone-600 dark:text-stone-400">
          Gerade konnten keine Prospektdaten geladen werden ({data.note}). Beim Planen sucht die KI die Angebote dann selbst im Internet.
        </div>
      )}
      {data && data.offers.length > 0 && (
        <>
          <p className="mb-2 text-xs text-stone-500">{list.length} von {data.offers.length} Angeboten</p>
          <div className="grid grid-cols-2 gap-2">
            {list.slice(0, 200).map((o) => (
              <div key={o.id} className="card flex flex-col overflow-hidden">
                {o.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.imageUrl} alt="" loading="lazy" className="h-24 w-full bg-white object-contain p-2" onError={(e) => (e.currentTarget.style.display = "none")} />
                )}
                <div className="flex flex-1 flex-col p-2.5">
                  <div className="text-[11px] font-semibold uppercase text-stone-500">{o.storeName}</div>
                  <div className="line-clamp-2 text-sm font-medium leading-snug">{[o.brand, o.product].filter(Boolean).join(" ")}</div>
                  {o.unit && <div className="text-xs text-stone-500">{o.unit}</div>}
                  <div className="mt-auto flex items-baseline gap-1.5 pt-1">
                    <span className="text-lg font-bold text-accent-600">{euro(o.price)}</span>
                    {o.oldPrice && <span className="text-xs text-stone-400 line-through">{euro(o.oldPrice)}</span>}
                  </div>
                  {o.loyaltyRequired && <div className="text-[10px] text-stone-500">nur mit App/Karte</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
