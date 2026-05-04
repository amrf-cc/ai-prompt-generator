import { NextRequest } from "next/server";
import { getBrand } from "@/lib/brands";
import { extractAllFields } from "@/lib/brand-extract";
import { requireUser } from "@/lib/auth-helpers";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const r = await requireUser();
  if (r.error) return r.error;
  try {
    const { slug } = await params;
    if (!getBrand(slug)) {
      return Response.json({ error: "Brand not found" }, { status: 404 });
    }
    const result = await extractAllFields(slug);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? String(err) }, { status: 500 });
  }
}
