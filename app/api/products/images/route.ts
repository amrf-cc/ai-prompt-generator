import { NextRequest } from "next/server";
import { requireUser, assertCanEditBrand } from "@/lib/auth-helpers";
import { getBrand } from "@/lib/brands";
import {
  addProductImage,
  removeProductImage,
  updateProductImage,
} from "@/lib/products";

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const form = await request.formData();
  const brandSlug = (form.get("brand") ?? "").toString().trim();
  const productId = (form.get("productId") ?? "").toString().trim();
  const file = form.get("file");
  const label = (form.get("label") ?? "").toString().trim();
  const description = (form.get("description") ?? "").toString().trim();

  if (!brandSlug) return Response.json({ error: "missing brand" }, { status: 400 });
  if (!productId) return Response.json({ error: "missing productId" }, { status: 400 });
  if (!(file instanceof File)) {
    return Response.json({ error: "missing file" }, { status: 400 });
  }
  if (!label) return Response.json({ error: "missing label" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) {
    return Response.json({ error: "file exceeds 25MB" }, { status: 413 });
  }

  const brand = getBrand(brandSlug);
  if (!brand) return Response.json({ error: "brand not found" }, { status: 404 });
  const editErr = assertCanEditBrand(brandSlug, auth.user, brand);
  if (editErr) return editErr;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  try {
    const product = addProductImage(
      brandSlug,
      productId,
      file.name,
      buffer,
      label,
      description || undefined
    );
    if (!product) return Response.json({ error: "product not found" }, { status: 404 });
    return Response.json(product, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const brandSlug = url.searchParams.get("brand");
  const productId = url.searchParams.get("productId");
  const filename = url.searchParams.get("filename");

  if (!brandSlug) return Response.json({ error: "missing brand" }, { status: 400 });
  if (!productId) return Response.json({ error: "missing productId" }, { status: 400 });
  if (!filename) return Response.json({ error: "missing filename" }, { status: 400 });

  const brand = getBrand(brandSlug);
  if (!brand) return Response.json({ error: "brand not found" }, { status: 404 });
  const editErr = assertCanEditBrand(brandSlug, auth.user, brand);
  if (editErr) return editErr;

  const product = removeProductImage(brandSlug, productId, filename);
  if (!product) return Response.json({ error: "product not found" }, { status: 404 });
  return Response.json(product);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | { brand?: unknown; productId?: unknown; filename?: unknown; label?: unknown; description?: unknown }
    | null;

  const brandSlug = typeof body?.brand === "string" ? body.brand : "";
  const productId = typeof body?.productId === "string" ? body.productId : "";
  const filename = typeof body?.filename === "string" ? body.filename : "";

  if (!brandSlug) return Response.json({ error: "missing brand" }, { status: 400 });
  if (!productId) return Response.json({ error: "missing productId" }, { status: 400 });
  if (!filename) return Response.json({ error: "missing filename" }, { status: 400 });

  const brand = getBrand(brandSlug);
  if (!brand) return Response.json({ error: "brand not found" }, { status: 404 });
  const editErr = assertCanEditBrand(brandSlug, auth.user, brand);
  if (editErr) return editErr;

  const patch: { label?: string; description?: string } = {};
  if (typeof body?.label === "string") patch.label = body.label;
  if (typeof body?.description === "string") patch.description = body.description;

  try {
    const product = updateProductImage(brandSlug, productId, filename, patch);
    if (!product) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(product);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}
