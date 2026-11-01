// VORÜBERGEHEND: Diagnose der marktguru-Schnittstelle. Wird nach der Analyse wieder entfernt.
import { getKeys } from "@/lib/offers";

const TOKEN = "214d1487254741acb5487de8b2a8de97";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("t") !== TOKEN) return new Response("not found", { status: 404 });
  const path = (url.searchParams.get("path") || "offers/search").replace(/[^a-zA-Z0-9/_-]/g, "");
  const qs = new URLSearchParams(url.searchParams);
  qs.delete("t");
  qs.delete("path");
  const k = await getKeys();
  const res = await fetch(`https://api.marktguru.de/api/v1/${path}?${qs}`, {
    headers: { "x-apikey": k.apiKey, "x-clientkey": k.clientKey, accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const j = json as { results?: { advertisers?: { uniqueName: string }[]; validityDates?: { from: string; to: string }[] }[]; totalResults?: number } | null;
  if (j && Array.isArray(j.results)) {
    const by: Record<string, number> = {};
    const from: Record<string, string[]> = {};
    for (const r of j.results) {
      const a = r.advertisers?.map((x) => x.uniqueName).join("+") ?? "?";
      by[a] = (by[a] ?? 0) + 1;
      const f = r.validityDates?.[0]?.from?.slice(0, 10) ?? "?";
      (from[a] ??= []).includes(f) || from[a].push(f);
    }
    return Response.json({ status: res.status, keys: Object.keys(j), totalResults: j.totalResults, count: j.results.length, byAdvertiser: by, validFrom: from, firstResultKeys: j.results[0] ? Object.keys(j.results[0]) : [] });
  }
  return Response.json({ status: res.status, body: text.slice(0, 6000) });
}
