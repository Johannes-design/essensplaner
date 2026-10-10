import { requireAuth } from "@/lib/auth";
import { loadOffers, todayBerlin } from "@/lib/offer-source";
import { STORES } from "@/lib/constants";

export const maxDuration = 120;

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const zip = (url.searchParams.get("zip") || "18435").replace(/\D/g, "").slice(0, 5);
  const stores = url.searchParams.get("stores")?.split(",").filter(Boolean) ?? STORES.map((s) => s.key);
  const day = url.searchParams.get("day") || todayBerlin();
  // Die Angebotsübersicht nutzt keine (kostenpflichtige) Websuche
  const result = await loadOffers(zip, stores, day, { allowWebSearch: false });
  if (url.searchParams.get("summary")) {
    const byStore = [...new Set(result.offers.map((o) => o.storeName))];
    return Response.json({ count: result.offers.length, stores: byStore, source: result.source });
  }
  return Response.json(result);
}
