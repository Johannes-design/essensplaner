// Die 14 EU-Hauptallergene + häufige Unverträglichkeiten.
// Die Stichwortlisten dienen als zweite, unabhängige Sicherheitsprüfung nach der KI.
export const ALLERGENS: { key: string; label: string; keywords: string[]; safeWords?: string[] }[] = [
  {
    key: "gluten",
    label: "Gluten (Weizen, Roggen, Gerste, Dinkel, Hafer)",
    keywords: ["weizen", "roggen", "gerste", "dinkel", "hafer", "mehl", "nudel", "spaghetti", "penne", "fusilli", "lasagne", "tagliatelle", "makkaroni", "brot", "brötchen", "toast", "baguette", "wrap", "tortilla", "couscous", "bulgur", "paniermehl", "semmelbrösel", "gnocchi", "pizza", "blätterteig", "teig", "seitan", "grieß", "spätzle", "maultasche", "tortellini", "ravioli", "panko", "croutons", "bier", "sojasauce", "sojasoße"],
    safeWords: ["glutenfrei", "reisnudel", "reismehl", "maismehl", "maistortilla", "kartoffelmehl"],
  },
  {
    key: "laktose",
    label: "Laktose / Milchprodukte",
    keywords: ["milch", "sahne", "butter", "käse", "joghurt", "quark", "schmand", "crème fraîche", "creme fraiche", "frischkäse", "mozzarella", "parmesan", "gouda", "feta", "hirtenkäse", "mascarpone", "ricotta", "rahm", "kefir", "buttermilch", "molke", "skyr", "halloumi", "burrata", "emmentaler", "cheddar", "schmelzkäse", "kochsahne", "sauerrahm"],
    safeWords: ["laktosefrei", "vegan", "hafermilch", "sojamilch", "mandelmilch", "kokosmilch", "reismilch", "erdnussbutter", "kakaobutter", "pflanzlich", "margarine", "butterbohne", "butterkeks"],
  },
  { key: "milcheiweiss", label: "Milcheiweiß (komplett milchfrei)", keywords: ["milch", "sahne", "butter", "käse", "joghurt", "quark", "schmand", "crème fraîche", "frischkäse", "mozzarella", "parmesan", "feta", "rahm", "kefir", "molke", "skyr", "halloumi", "ghee"], safeWords: ["hafermilch", "sojamilch", "mandelmilch", "kokosmilch", "reismilch", "erdnussbutter", "vegan", "pflanzlich", "margarine", "butterbohne"] },
  { key: "ei", label: "Eier", keywords: ["=ei", "eier", "eigelb", "eiweiß", "mayonnaise", "mayo", "eiernudel", "spätzle", "baiser", "rührei", "spiegelei"], safeWords: ["eifrei", "vegan"] },
  { key: "erdnuss", label: "Erdnüsse", keywords: ["erdnuss", "erdnüsse", "satay"] },
  { key: "nuesse", label: "Schalenfrüchte / Nüsse", keywords: ["nuss", "nüsse", "mandel", "haselnuss", "walnuss", "cashew", "pistazie", "pekannuss", "macadamia", "paranuss", "pesto", "nougat", "marzipan"], safeWords: ["kokosnuss", "muskatnuss", "nussfrei", "muskat"] },
  { key: "fisch", label: "Fisch", keywords: ["fisch", "lachs", "thunfisch", "kabeljau", "seelachs", "forelle", "hering", "makrele", "sardine", "sardelle", "anchovis", "pangasius", "dorsch", "scholle", "matjes", "rotbarsch", "alaska", "fischstäbchen", "worcester"] },
  { key: "krebstiere", label: "Krebstiere (Garnelen, Krabben)", keywords: ["garnele", "shrimp", "krabbe", "krebs", "hummer", "scampi", "languste", "gambas", "surimi"] },
  { key: "weichtiere", label: "Weichtiere (Muscheln, Tintenfisch)", keywords: ["muschel", "tintenfisch", "calamari", "oktopus", "schnecke", "auster", "sepia"] },
  { key: "soja", label: "Soja", keywords: ["soja", "tofu", "edamame", "tempeh", "miso"] },
  { key: "sellerie", label: "Sellerie", keywords: ["sellerie", "suppengrün", "suppengemüse"] },
  { key: "senf", label: "Senf", keywords: ["senf", "dijon"] },
  { key: "sesam", label: "Sesam", keywords: ["sesam", "tahin", "tahini", "hummus"] },
  { key: "lupine", label: "Lupinen", keywords: ["lupine"] },
  { key: "sulfite", label: "Sulfite (z. B. Wein, Trockenobst)", keywords: ["wein", "sekt", "trockenobst", "rosinen", "getrocknete aprikose"] },
  { key: "fruktose", label: "Fruktose-Unverträglichkeit", keywords: ["apfel", "äpfel", "birne", "mango", "honig", "agavendicksaft", "trockenobst", "fruchtsaft", "apfelsaft"] },
  { key: "histamin", label: "Histamin-Unverträglichkeit", keywords: ["tomate", "spinat", "aubergine", "avocado", "sauerkraut", "salami", "rohschinken", "parmesan", "gouda", "emmentaler", "thunfisch", "makrele", "sardine", "wein", "essig", "sojasauce"] },
];

export const allergenLabel = (key: string) => ALLERGENS.find((a) => a.key === key)?.label ?? key;

/** Prüft einen Zutaten-/Produktnamen gegen die Allergien. Gibt die betroffenen Allergen-Labels zurück. */
// Wortteile, die fälschlich Treffer erzeugen würden (z. B. "Schwein" enthält "wein").
const IGNORE = ["schwein", "weintraube", "weinbeere"];

export function findAllergens(text: string, allergyKeys: string[]): string[] {
  const raw = ` ${text.toLowerCase()} `;
  let t = raw;
  for (const ig of IGNORE) t = t.split(ig).join(" ");
  const hits: string[] = [];
  for (const key of allergyKeys) {
    const a = ALLERGENS.find((x) => x.key === key);
    if (!a) continue;
    if (a.safeWords?.some((s) => raw.includes(s))) continue;
    const hit = a.keywords.some((k) =>
      k.startsWith("=") ? new RegExp(`(^|[^a-zäöüß])${k.slice(1)}([^a-zäöüß]|$)`).test(t) : t.includes(k),
    );
    if (hit) hits.push(a.label);
  }
  return hits;
}
