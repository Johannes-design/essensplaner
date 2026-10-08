export const STORES: { key: string; name: string; match: string[] }[] = [
  { key: "aldi-nord", name: "Aldi Nord", match: ["aldi-nord", "aldi"] },
  { key: "lidl", name: "Lidl", match: ["lidl"] },
  { key: "rewe", name: "REWE", match: ["rewe"] },
  { key: "edeka", name: "EDEKA", match: ["edeka"] },
  { key: "netto", name: "Netto Marken-Discount", match: ["netto-marken-discount", "netto"] },
  { key: "penny", name: "Penny", match: ["penny"] },
  { key: "kaufland", name: "Kaufland", match: ["kaufland"] },
  { key: "norma", name: "Norma", match: ["norma"] },
];

export const storeName = (key: string) => STORES.find((s) => s.key === key)?.name ?? (key === "egal" ? "Beliebiger Markt" : key);

export const EQUIPMENT = ["Backofen", "Mikrowelle", "Airfryer", "Mixer/Pürierstab", "Slow Cooker", "Wok", "Thermomix"];

export const DEFAULT_PANTRY = ["Salz", "Pfeffer", "Speiseöl", "Zucker", "Mehl", "Gemüsebrühe", "Paprikapulver", "Essig"];

export const CATEGORIES = [
  "Obst & Gemüse",
  "Fleisch & Fisch",
  "Kühlregal",
  "Brot & Backwaren",
  "Nudeln, Reis & Konserven",
  "Tiefkühl",
  "Gewürze & Saucen",
  "Sonstiges",
];
