import { codeRequired, codeValid } from "@/lib/auth";
import { hasRedis } from "@/lib/redis";

export async function GET(request: Request) {
  return Response.json(
    {
      codeRequired: codeRequired(),
      codeValid: codeValid(request),
      // Gemeinsame Daten nur mit Haushalts-Code, sonst wären sie für jeden mit dem Link lesbar
      sync: hasRedis() && codeRequired(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
