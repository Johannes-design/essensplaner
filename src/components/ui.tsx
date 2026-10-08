"use client";
import { useState } from "react";

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

export function Loading({ text = "Lädt …" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-stone-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600" />
      {text}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: string; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 text-5xl">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 mb-5 text-sm text-stone-500">{text}</p>
      {action}
    </div>
  );
}

/** Eingabe für eine Liste von Begriffen (Tags). */
export function TagInput({ value, onChange, placeholder, suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; suggestions?: string[] }) {
  const [text, setText] = useState("");
  const add = (t: string) => {
    const parts = t.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const next = [...value];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setText("");
  };
  const open = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <button key={v} type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="chip-on" aria-label={`${v} entfernen`}>
              {v} <span className="opacity-70">✕</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="input"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) add(text);
            }
          }}
        />
        <button type="button" className="btn-secondary px-3" onClick={() => text.trim() && add(text)} aria-label="Hinzufügen">
          ＋
        </button>
      </div>
      {open.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {open.map((s) => (
            <button key={s} type="button" className="chip-off" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card mb-4 p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-3 text-sm text-stone-500">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}
