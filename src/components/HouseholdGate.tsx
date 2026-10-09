"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { getCode, getName, getStoredHousehold, setCode, setName, setStoredHousehold, startSync, wipeLocal } from "@/lib/sync";

type State = "checking" | "locked" | "syncing" | "ready" | "offline";
export interface Session {
  name: string;
  isAdmin: boolean;
  householdId: string;
}

const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext);

export function logout() {
  wipeLocal();
  // Nach dem Neuladen auf der Startseite landen
  window.history.replaceState(null, "", "/");
  window.location.reload();
}

async function fetchStatus(name: string, code: string) {
  const res = await fetch("/api/status", { headers: { "x-household-code": code, "x-household-name": encodeURIComponent(name) }, cache: "no-store" });
  return (await res.json()) as { codeValid: boolean; sync: boolean; householdId: string | null; name: string | null; isAdmin: boolean };
}

/** Anmeldung mit Name + Code; lädt danach die Daten des eigenen Haushalts. */
export default function HouseholdGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [nameInput, setNameInput] = useState(() => (typeof window === "undefined" ? "" : getName()));
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchStatus(getName(), getCode());
        if (cancelled) return;
        if (!s.codeValid || !s.householdId) return setState("locked");
        // Lokale Daten eines anderen Zugangs nie in diesen Haushalt übernehmen.
        // Geräte aus der Zeit vor den Zugängen gehören zum Haupt-Haushalt.
        const stored = getStoredHousehold() ?? "main";
        if (stored !== s.householdId) wipeLocal(true);
        setStoredHousehold(s.householdId);
        setSession({ name: s.name ?? "", isAdmin: s.isAdmin, householdId: s.householdId });
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
        {state === "syncing" ? "Lade deine Daten …" : ""}
      </div>
    );

  if (state === "locked")
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
        <div className="mb-6 text-center">
          <div className="text-6xl">🥘</div>
          <h1 className="mt-3 text-2xl font-bold">Kochfaul</h1>
          <p className="mt-2 text-sm text-stone-500">Melde dich mit deinem Namen und deinem Code an. Das Handy merkt sich die Anmeldung.</p>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const name = nameInput.trim();
            const code = codeInput.trim();
            const s = await fetchStatus(name, code).catch(() => null);
            if (!s) return setError("Keine Verbindung.");
            if (!s.codeValid) return setError("Name oder Code stimmen nicht.");
            setName(name);
            setCode(code);
            setState("checking");
            setAttempt((a) => a + 1);
          }}
        >
          <label className="label" htmlFor="login-name">Name</label>
          <input id="login-name" className="input mb-3" autoComplete="username" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="z. B. Emily" />
          <label className="label" htmlFor="login-code">Code</label>
          <input id="login-code" className="input mb-3 text-center text-lg tracking-widest" type="password" inputMode="numeric" autoComplete="current-password" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="••••" />
          {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={!codeInput.trim()}>
            Anmelden
          </button>
        </form>
      </div>
    );

  return (
    <SessionContext.Provider value={session}>
      {state === "offline" && (
        <div className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Offline – Änderungen werden übertragen, sobald wieder Verbindung besteht.{" "}
          <button type="button" className="underline" onClick={() => setAttempt((a) => a + 1)}>
            Erneut versuchen
          </button>
        </div>
      )}
      {children}
    </SessionContext.Provider>
  );
}
