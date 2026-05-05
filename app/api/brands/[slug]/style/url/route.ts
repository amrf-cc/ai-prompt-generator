import { NextRequest } from "next/server";
import { getBrand } from "@/lib/brands";
import { ingestUrl } from "@/lib/url-style-ingest";
import {
  requireUser,
  assertCanEditBrand,
  isBrandVisibleTo,
} from "@/lib/auth-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const r = await requireUser();
  if (r.error) return r.error;
  try {
    const { slug } = await params;
    const brandRecord = getBrand(slug);
    if (!brandRecord) {
      return Response.json({ error: "Brand not found" }, { status: 404 });
    }
    if (!isBrandVisibleTo(brandRecord, r.user)) {
      return Response.json({ error: "Brand not found" }, { status: 404 });
    }
    const block = assertCanEditBrand(slug, r.user, brandRecord);
    if (block) return block;
    const body = (await request.json()) as { url?: string };
    const url = (body.url ?? "").trim();
    if (!url) return Response.json({ error: "url required" }, { status: 400 });

    const result = await ingestUrl(slug, url);
    if (result.saved_files.length === 0) {
      return Response.json(
        { error: result.errors[0] ?? "Failed to ingest URL", errors: result.errors },
        { status: 400 }
      );
    }
    const brand = getBrand(slug);
    return Response.json({ ...result, brand });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
