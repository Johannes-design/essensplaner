import { codeRequired, requireCode } from "@/lib/auth";
import { applyOps, loadHousehold } from "@/lib/household";
import { hasRedis } from "@/lib/redis";

const disabled = () => Response.json({ error: "Synchronisierung ist nicht eingerichtet" }, { status: 404 });

export async function GET(request: Request) {
  if (!hasRedis() || !codeRequired()) return disabled();
  const denied = requireCode(request);
  if (denied) return denied;
  try {
    return Response.json(await loadHousehold(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[sync] laden", e);
    return Response.json({ error: "Daten konnten nicht geladen werden" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!hasRedis() || !codeRequired()) return disabled();
  const denied = requireCode(request);
  if (denied) return denied;
  const text = await request.text();
  if (text.length > 2_000_000) return Response.json({ error: "Zu groß" }, { status: 413 });
  let ops: unknown;
  try {
    ops = JSON.parse(text)?.ops;
  } catch {
    return Response.json({ error: "Ungültig" }, { status: 400 });
  }
  if (!Array.isArray(ops)) return Response.json({ error: "Ungültig" }, { status: 400 });
  try {
    await applyOps(ops);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[sync] speichern", e);
    return Response.json({ error: "Speichern fehlgeschlagen" }, { status: 502 });
  }
}
