"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ALLERGENS } from "@/lib/allergens";
import { DEFAULT_PANTRY, EQUIPMENT, STORES } from "@/lib/constants";
import { DEFAULT_PROFILE, exportAll, importAll, useStored } from "@/lib/store";
import type { Diet, Profile } from "@/lib/types";
import { Header, Loading, Section, TagInput } from "@/components/ui";
import Link from "next/link";
import { logout, useSession } from "@/components/HouseholdGate";

const DIETS: { key: Diet; label: string }[] = [
  { key: "alles", label: "Esse alles" },
  { key: "flexitarisch", label: "Wenig Fleisch" },
  { key: "pescetarisch", label: "Pescetarisch" },
  { key: "vegetarisch", label: "Vegetarisch" },
  { key: "vegan", label: "Vegan" },
];

export default function ProfilPage() {
  const [stored] = useStored("profile");
  const [version, setVersion] = useState(0);
  if (stored === undefined) return <Loading />;
  return <ProfilForm key={version} initial={stored} onImported={() => setVersion((v) => v + 1)} />;
}

function ProfilForm({ initial, onImported }: { initial: Profile | null; onImported: () => void }) {
  const [, setStored] = useStored("profile");
  const [p, setP] = useState<Profile>(initial ?? DEFAULT_PROFILE);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const isNew = initial === null;
  const session = useSession();

  const up = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setP({ ...p, [k]: v });
    setSaved(false);
  };
  const toggle = (k: "stores" | "allergies" | "equipment", v: string) =>
    up(k, p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v]);

  const save = () => {
    if (!p.stores.length) return alert("Bitte mindestens einen Markt auswählen.");
    setStored(p);
    setSaved(true);
    if (isNew) router.push("/neu");
  };

  return (
    <div>
      <Header title={isNew ? "Willkommen! 👋" : "Mein Profil"} subtitle={isNew ? "Erzähl kurz, was du magst – dann plant die App deine Woche." : "Grundlage für jeden Wochenplan"} />

      <Section title="Allgemein">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label" htmlFor="name">Name (optional)</label>
            <input id="name" className="input" value={p.name} onChange={(e) => up("name", e.target.value)} placeholder="z. B. Johannes" />
          </div>
          <div>
            <label className="label" htmlFor="persons">Personen</label>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary px-3 py-2" onClick={() => up("persons", Math.max(1, p.persons - 1))}>−</button>
              <span id="persons" className="w-8 text-center text-lg font-semibold">{p.persons}</span>
              <button type="button" className="btn-secondary px-3 py-2" onClick={() => up("persons", Math.min(10, p.persons + 1))}>＋</button>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="zip">Postleitzahl</label>
            <input id="zip" className="input" inputMode="numeric" maxLength={5} value={p.zipCode} onChange={(e) => up("zipCode", e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor="cook">Maximale Kochzeit pro Gericht: <b>{p.maxCookMinutes} Min.</b></label>
            <input id="cook" type="range" min={10} max={60} step={5} value={p.maxCookMinutes} onChange={(e) => up("maxCookMinutes", Number(e.target.value))} className="w-full accent-brand-600" />
          </div>
          <label className="col-span-2 flex items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={p.leftoversForLunch} onChange={(e) => up("leftoversForLunch", e.target.checked)} />
            <span className="text-sm">Reste vom Abendbrot dürfen am nächsten Tag Mittagessen sein (spart Zeit & Geld)</span>
          </label>
        </div>
      </Section>

      <Section title="Wo kaufst du ein?" hint="Nur Angebote dieser Märkte werden genutzt.">
        <div className="flex flex-wrap gap-2">
          {STORES.map((s) => (
            <button key={s.key} type="button" className={p.stores.includes(s.key) ? "chip-on" : "chip-off"} onClick={() => toggle("stores", s.key)}>
              {s.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="⚠️ Allergien & Unverträglichkeiten" hint="Sehr wichtig: Diese Zutaten kommen garantiert nicht in den Plan. Jeder Plan wird zusätzlich automatisch geprüft.">
        <div className="flex flex-col gap-1">
          {ALLERGENS.map((a) => (
            <label key={a.key} className={`flex items-center gap-3 rounded-lg px-2 py-2 ${p.allergies.includes(a.key) ? "bg-red-50 dark:bg-red-950/40" : ""}`}>
              <input type="checkbox" className="h-5 w-5 accent-red-600" checked={p.allergies.includes(a.key)} onChange={() => toggle("allergies", a.key)} />
              <span className="text-sm">{a.label}</span>
            </label>
          ))}
        </div>
        <label className="label mt-3" htmlFor="other">Weitere Unverträglichkeiten / No-Gos</label>
        <textarea id="other" className="input" rows={2} value={p.otherIntolerances} onChange={(e) => up("otherIntolerances", e.target.value)} placeholder="z. B. Knoblauch, sehr scharfes Essen, Pilze" />
      </Section>

      <Section title="Ernährung">
        <div className="flex flex-wrap gap-2">
          {DIETS.map((d) => (
            <button key={d.key} type="button" className={p.diet === d.key ? "chip-on" : "chip-off"} onClick={() => up("diet", d.key)}>
              {d.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="😋 Das esse ich gerne" hint="Zutaten, Küchen oder Geschmacksrichtungen">
        <TagInput value={p.likes} onChange={(v) => up("likes", v)} placeholder="z. B. Hähnchen, Nudeln, asiatisch" suggestions={["Nudeln", "Kartoffeln", "Reis", "Hähnchen", "Hackfleisch", "Gemüse", "Asiatisch", "Mexikanisch", "Italienisch", "Hausmannskost", "Aufläufe", "Suppen"]} />
      </Section>

      <Section title="🙅 Das mag ich nicht" hint="Wird nicht verwendet">
        <TagInput value={p.dislikes} onChange={(v) => up("dislikes", v)} placeholder="z. B. Rosenkohl, Leber" suggestions={["Rosenkohl", "Pilze", "Leber", "Fisch", "Oliven", "Koriander", "Rote Bete", "Auberginen"]} />
      </Section>

      <Section title="❤️ Lieblingsgerichte" hint="Diese Gerichte werden regelmäßig eingeplant – mit Angeboten möglichst günstig.">
        <TagInput value={p.favoriteDishes} onChange={(v) => up("favoriteDishes", v)} placeholder="z. B. Spaghetti Bolognese" />
      </Section>

      <Section title="Küchengeräte">
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((e) => (
            <button key={e} type="button" className={p.equipment.includes(e) ? "chip-on" : "chip-off"} onClick={() => toggle("equipment", e)}>
              {e}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Immer im Vorrat" hint="Wird verwendet, aber nicht auf die Einkaufsliste gesetzt.">
        <TagInput value={p.pantry} onChange={(v) => up("pantry", v)} placeholder="z. B. Sojasauce" suggestions={[...DEFAULT_PANTRY, "Knoblauch", "Senf", "Ketchup", "Reis", "Nudeln", "Tomatenmark", "Oregano", "Curry"]} />
      </Section>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 mb-4">
        <button type="button" className="btn-primary w-full shadow-lg" onClick={save}>
          {saved ? "✓ Gespeichert" : isNew ? "Speichern & ersten Plan erstellen" : "Profil speichern"}
        </button>
      </div>

      {session && (
        <Section title="Anmeldung">
          <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
            Angemeldet als <b>{session.householdId === "main" ? "Haupt-Haushalt (Johannes & Maxi)" : session.name}</b>
          </p>
          <div className="flex flex-col gap-2">
            {session.isAdmin && (
              <Link href="/verwaltung" className="btn-secondary w-full">
                👥 Zugänge & Kosten verwalten
              </Link>
            )}
            <button
              type="button"
              className="btn-secondary w-full text-red-600"
              onClick={() => confirm("Auf diesem Gerät abmelden? Deine Daten bleiben online gespeichert.") && logout()}
            >
              Abmelden
            </button>
          </div>
        </Section>
      )}

      {!isNew && (
        <Section title="Daten sichern" hint="Sicherungskopie aller Daten als Datei – zur Sicherheit ab und zu exportieren.">
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => {
                const blob = new Blob([exportAll()], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `essensplaner-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
              }}
            >
              ⬇️ Exportieren
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={() => fileRef.current?.click()}>
              ⬆️ Importieren
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  importAll(await f.text());
                  onImported();
                  alert("Daten importiert.");
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Import fehlgeschlagen");
                }
              }}
            />
          </div>
        </Section>
      )}
    </div>
  );
}
