import { createAccount, deleteAccount, listAccounts, MAIN_HOUSEHOLD, requireAuth, setAccountPin } from "@/lib/auth";
import { getCosts } from "@/lib/costs";
import { hasRedis } from "@/lib/redis";

async function admin(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!auth.isAdmin) return Response.json({ error: "Nur für den Haupt-Haushalt" }, { status: 403 });
  if (!hasRedis()) return Response.json({ error: "Datenbank fehlt" }, { status: 404 });
  return auth;
}

export async function GET(request: Request) {
  const auth = await admin(request);
  if (auth instanceof Response) return auth;
  const accounts = await listAccounts();
  const costs = await getCosts([MAIN_HOUSEHOLD, ...accounts.map((a) => a.householdId)]);
  return Response.json({
    accounts: [
      { name: "Ihr (Johannes & Maxi)", householdId: MAIN_HOUSEHOLD, createdAt: null, main: true, costs: costs[MAIN_HOUSEHOLD] ?? {} },
      ...accounts.map((a) => ({ name: a.name, householdId: a.householdId, createdAt: a.createdAt, main: false, costs: costs[a.householdId] ?? {} })),
    ],
  });
}

export async function POST(request: Request) {
  const auth = await admin(request);
  if (auth instanceof Response) return auth;
  const { action, name, pin } = (await request.json().catch(() => ({}))) as { action?: string; name?: string; pin?: string };
  try {
    if (action === "create") await createAccount(name ?? "", pin ?? "");
    else if (action === "setPin") await setAccountPin(name ?? "", pin ?? "");
    else if (action === "delete") await deleteAccount(name ?? "");
    else return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Fehler" }, { status: 400 });
  }
}
