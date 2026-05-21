import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { getUsage } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const brand = searchParams.get("brand") ?? undefined;
  const since = searchParams.get("since") ?? undefined;
  const scope = searchParams.get("scope"); // "mine" | "all" (admin)

  const filters: { brand_slug?: string; since?: string; created_by?: string } = {};
  if (brand) filters.brand_slug = brand;
  if (since) filters.since = since;
  if (scope !== "all" || !auth.user.isAdmin) {
    filters.created_by = auth.user.email;
  }

  const usage = getUsage(filters);
  return Response.json(usage);
}
