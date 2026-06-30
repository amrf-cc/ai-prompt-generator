import { NextRequest } from "next/server";
import { getMediaGenerations } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  try {
    const { searchParams } = request.nextUrl;
    const filters = {
      brand_slug: searchParams.get("brand") || undefined,
      kind: searchParams.get("kind") || undefined,
      limit: searchParams.get("limit")
        ? parseInt(searchParams.get("limit")!)
        : undefined,
    };

    const rows = getMediaGenerations(filters);
    return Response.json(rows);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}