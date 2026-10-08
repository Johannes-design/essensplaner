"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Woche", icon: "📅" },
  { href: "/einkauf", label: "Einkauf", icon: "🛒" },
  { href: "/neu", label: "Planen", icon: "✨" },
  { href: "/angebote", label: "Angebote", icon: "🏷️" },
  { href: "/profil", label: "Profil", icon: "👤" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95">
      <div className="mx-auto flex max-w-lg justify-around pb-[env(safe-area-inset-bottom)]">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" || path.startsWith("/gericht") : path.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${active ? "font-semibold text-brand-600 dark:text-brand-500" : "text-stone-500"}`}
            >
              <span className={`text-xl leading-none ${active ? "" : "grayscale opacity-70"}`}>{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
