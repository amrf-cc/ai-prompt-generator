import { NextRequest } from "next/server";
import { getBrand } from "@/lib/brands";
import { extractField } from "@/lib/brand-extract";
import type { BrandExtractField } from "@/lib/types";
import { requireUser } from "@/lib/auth-helpers";

const VALID: BrandExtractField[] = ["voice", "visual", "legal"];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; field: string }> }
) {
  const r = await requireUser();
  if (r.error) return r.error;
  try {
    const { slug, field } = await params;
    if (!getBrand(slug)) {
      return Response.json({ error: "Brand not found" }, { status: 404 });
    }
    if (!VALID.includes(field as BrandExtractField)) {
      return Response.json({ error: `Unknown field: ${field}` }, { status: 400 });
    }
    const result = await extractField(slug, field as BrandExtractField);
    return Response.json({ [field]: result });
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? String(err) }, { status: 500 });
  }
}
