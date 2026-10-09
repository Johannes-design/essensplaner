import { authenticate } from "@/lib/auth";
import { hasRedis } from "@/lib/redis";

export async function GET(request: Request) {
  const auth = await authenticate(request);
  return Response.json(
    {
      codeRequired: true,
      codeValid: !!auth,
      sync: hasRedis(),
      householdId: auth?.householdId ?? null,
      name: auth?.name ?? null,
      isAdmin: auth?.isAdmin ?? false,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
