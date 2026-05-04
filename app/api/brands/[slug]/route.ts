import { NextRequest } from "next/server";
import { getBrand, updateBrandMetadata, deleteBrandFile } from "@/lib/brands";
import type { BrandProfile } from "@/lib/types";
import { requireUser, assertCanEditBrand } from "@/lib/auth-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const r = await requireUser();
  if (r.error) return r.error;
  const { slug } = await params;
  const brand = getBrand(slug);
  if (!brand) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(brand);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const r = await requireUser();
  if (r.error) return r.error;
  try {
    const { slug } = await params;
    const block = assertCanEditBrand(slug, r.user);
    if (block) return block;

    const body = (await request.json()) as Partial<{
      notes: string;
      voice: BrandProfile["voice"];
      visual: BrandProfile["visual"];
      legal: BrandProfile["legal"];
    }>;

    const allowed: typeof body = {};
    if (typeof body.notes === "string") allowed.notes = body.notes;
    if (body.voice !== undefined) allowed.voice = body.voice;
    if (body.visual !== undefined) allowed.visual = body.visual;
    if (body.legal !== undefined) allowed.legal = body.legal;

    const updated = updateBrandMetadata(slug, allowed);
    if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(updated);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const r = await requireUser();
  if (r.error) return r.error;
  try {
    const { slug } = await params;
    const block = assertCanEditBrand(slug, r.user);
    if (block) return block;

    const url = new URL(request.url);
    const file = url.searchParams.get("file");
    if (!file) return Response.json({ error: "file query param required" }, { status: 400 });
    const ok = deleteBrandFile(slug, file);
    if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
    const brand = getBrand(slug);
    return Response.json(brand);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
