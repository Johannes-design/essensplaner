import { requireAuth } from "@/lib/auth";
import { recordCost } from "@/lib/costs";
import { applyOps } from "@/lib/household";
import { hasRedis } from "@/lib/redis";
import Anthropic from "@anthropic-ai/sdk";
import { buildPlanPrompt, costCents, generatePlan, hasApiKey } from "@/lib/ai";
import { demoPlan } from "@/lib/demo";
import { offersToPromptLines } from "@/lib/offers";
import { isDemo, loadOffers, selectForPrompt, todayBerlin } from "@/lib/offer-source";
import { postprocess } from "@/lib/postprocess";
import type { PlanRequest } from "@/lib/types";

export const maxDuration = 300;

type Event =
  | { type: "status"; message: string; progress: number }
  | { type: "result"; plan: unknown }
  | { type: "error"; message: string };

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const req = (await request.json()) as PlanRequest & { confirmed?: boolean };
  // Kostet KI-Guthaben: nur nach ausdrücklicher Bestätigung in der App
  if (req.confirmed !== true) return Response.json({ error: "Bitte die Kosten bestätigen" }, { status: 400 });
  const invalid = validate(req);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Schließt jemand die App, läuft die Planung trotzdem zu Ende – Senden darf dann nicht abstürzen
      let open = true;
      const write = (text: string) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(text));
        } catch {
          open = false;
        }
      };
      const send = (e: Event) => write(JSON.stringify(e) + "\n");
      // Verbindung offen halten, solange die KI rechnet
      let cents = 0; // auch bei Fehlern abrechnen, was schon verbraucht wurde
      const ping = setInterval(() => write("\n"), 10000);
      try {
        send({ type: "status", message: "Suche die aktuellen Angebote in Stralsund …", progress: 5 });
        const demo = isDemo() || !hasApiKey();
        const { offers, source, note } = await loadOffers(req.profile.zipCode, req.profile.stores, req.shoppingDate ?? todayBerlin(), { allowWebSearch: !demo });
        const forPrompt = selectForPrompt(offers);
        send({
          type: "status",
          message: offers.length ? `${offers.length} Angebote gefunden (${note}). Plane die Woche …` : "Keine Angebote gefunden – plane mit normalen Preisen …",
          progress: 20,
        });

        if (demo) {
          const { plan } = postprocess(demoPlan(req), req, offers, { offerSource: source, demo: true });
          await new Promise((r) => setTimeout(r, 800));
          send({ type: "result", plan });
          return;
        }

        const messages: Anthropic.Beta.BetaMessageParam[] = [
          { role: "user", content: buildPlanPrompt(req, forPrompt, offersToPromptLines(forPrompt), note) },
        ];
        let result: ReturnType<typeof postprocess> | null = null;
        let lastSent = 0;
        for (let attempt = 0; attempt < 3; attempt++) {
          const base = 20 + attempt * 25;
          const { data, message } = await generatePlan(messages, (chars) => {
            // grobe Fortschrittsanzeige anhand der erzeugten Zeichen, höchstens alle 1,5 s
            if (Date.now() - lastSent < 1500) return;
            lastSent = Date.now();
            const p = Math.min(base + 24, base + Math.round((chars / 14000) * 24));
            send({ type: "status", message: attempt ? "Korrigiere den Plan …" : "Stelle Gerichte und Einkaufsliste zusammen …", progress: p });
          });
          cents += costCents(message.usage);
          result = postprocess(data, req, forPrompt, { offerSource: source, demo: false });
          if (!result.problems.length) break;
          if (attempt === 2) break;
          send({ type: "status", message: "Prüfe Budget & Allergien – verbessere den Plan …", progress: base + 25 });
          messages.push({ role: "assistant", content: message.content });
          messages.push({
            role: "user",
            content: `Die automatische Prüfung hat Probleme gefunden:\n- ${result.problems.join("\n- ")}\n\nBitte gib den kompletten, korrigierten Plan erneut aus.`,
          });
        }
        await recordCost(auth.householdId, cents);
        const finalPlan = { ...result!.plan, aiCostCents: Math.round(cents * 10) / 10 };
        // Direkt im Haushalt speichern: geht nicht verloren, wenn die App zwischendurch geschlossen wurde
        if (hasRedis()) await applyOps(auth.householdId, [{ op: "putPlan", plan: finalPlan }]).catch((err) => console.error("[plan] speichern", err));
        send({ type: "result", plan: finalPlan });
      } catch (e) {
        console.error("[plan]", e);
        await recordCost(auth.householdId, cents);
        let message = e instanceof Error ? e.message : "Unbekannter Fehler";
        if (e instanceof Anthropic.AuthenticationError) message = "Der API-Schlüssel ist ungültig.";
        else if (e instanceof Anthropic.RateLimitError) message = "Zu viele Anfragen – bitte in einer Minute erneut versuchen.";
        else if (e instanceof Anthropic.APIError) message = `KI-Dienst nicht erreichbar (${e.status ?? "Netzwerk"}). Bitte erneut versuchen.`;
        send({ type: "error", message });
      } finally {
        clearInterval(ping);
        if (open) {
          try {
            controller.close();
          } catch {}
        }
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

function validate(r: PlanRequest): string | null {
  if (!r?.profile) return "Profil fehlt";
  if (!(r.budget > 0 && r.budget < 2000)) return "Bitte ein gültiges Budget angeben";
  if (!Array.isArray(r.slots) || r.slots.length !== 7) return "Ungültige Wochenauswahl";
  if (!r.slots.some((s) => s.mittag || s.abend)) return "Bitte mindestens eine Mahlzeit auswählen";
  if (!r.profile.stores?.length) return "Bitte mindestens einen Markt im Profil auswählen";
  r.knownDishes = Array.isArray(r.knownDishes) ? r.knownDishes.filter((d) => typeof d === "string").slice(0, 80) : [];
  r.lastWeekDishes = Array.isArray(r.lastWeekDishes) ? r.lastWeekDishes.filter((d) => typeof d === "string").slice(0, 21) : [];
  return null;
}
