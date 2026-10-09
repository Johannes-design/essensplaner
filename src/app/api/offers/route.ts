import { requireAuth } from "@/lib/auth";
import { loadOffers } from "@/lib/offer-source";
import { STORES } from "@/lib/constants";

export const maxDuration = 120;

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const zip = (url.searchParams.get("zip") || "18435").replace(/\D/g, "").slice(0, 5);
  const stores = url.searchParams.get("stores")?.split(",").filter(Boolean) ?? STORES.map((s) => s.key);
  const weekStart = url.searchParams.get("weekStart") || new Date().toISOString().slice(0, 10);
  // Die Angebotsübersicht nutzt keine (kostenpflichtige) Websuche
  const result = await loadOffers(zip, stores, weekStart, { allowWebSearch: false });
  return Response.json(result);
}
