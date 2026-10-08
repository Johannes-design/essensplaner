"use client";
import { useEffect, useState } from "react";
import { getCode, setCode, startSync } from "@/lib/sync";

type State = "checking" | "locked" | "syncing" | "ready" | "offline";

/** Fragt den Haushalts-Code ab und lädt die gemeinsamen Daten, bevor die App angezeigt wird. */
export default function HouseholdGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/status", { headers: { "x-household-code": getCode() }, cache: "no-store" });
        const s = (await res.json()) as { codeRequired: boolean; codeValid: boolean; sync: boolean };
        if (cancelled) return;
        if (s.codeRequired && !s.codeValid) return setState("locked");
        if (!s.sync) return setState("ready");
        setState("syncing");
        // Nicht ewig warten, falls das Netz schlecht ist – lokale Daten gehen auch
        const ok = await Promise.race([startSync(), new Promise<boolean>((r) => setTimeout(() => r(false), 8000))]);
        if (!cancelled) setState(ok ? "ready" : "offline");
      } catch {
        if (!cancelled) setState("offline");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    const lock = () => setState("locked");
    window.addEventListener("household:locked", lock);
    return () => window.removeEventListener("household:locked", lock);
  }, []);

  if (state === "checking" || state === "syncing")
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-stone-500">
        <div className="text-5xl">🥘</div>
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600" />
        {state === "syncing" ? "Lade euren Haushalt …" : ""}
      </div>
    );

  if (state === "locked")
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
        <div className="mb-6 text-center">
          <div className="text-6xl">🔒</div>
          <h1 className="mt-3 text-2xl font-bold">Haushalts-Code</h1>
          <p className="mt-2 text-sm text-stone-500">Einmal eingeben – danach merkt sich dieses Handy den Code. Alle mit dem Code teilen Profil, Pläne, Einkaufsliste und Rezeptbuch.</p>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const code = input.trim();
            const res = await fetch("/api/status", { headers: { "x-household-code": code }, cache: "no-store" }).catch(() => null);
            const s = res ? await res.json() : null;
            if (!s?.codeValid) return setError(res ? "Der Code stimmt nicht." : "Keine Verbindung.");
            setCode(code);
            setState("checking");
            setAttempt((a) => a + 1);
          }}
        >
          <input className="input mb-3 text-center text-lg" type="password" autoComplete="current-password" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Code" autoFocus />
          {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={!input.trim()}>
            Öffnen
          </button>
        </form>
      </div>
    );

  return (
    <>
      {state === "offline" && (
        <div className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Offline – Änderungen werden übertragen, sobald wieder Verbindung besteht.{" "}
          <button type="button" className="underline" onClick={() => setAttempt((a) => a + 1)}>
            Erneut versuchen
          </button>
        </div>
      )}
      {children}
    </>
  );
}
