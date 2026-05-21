import { NextRequest } from "next/server";
import { requireUser, assertCanEditBrand, isBrandVisibleTo } from "@/lib/auth-helpers";
import { getBrand } from "@/lib/brands";
import {
  listProducts,
  saveProduct,
  deleteProduct,
  updateProductCategories,
  listProductCategories,
} from "@/lib/products";

function parseCategories(value: FormDataEntryValue | unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      return [];
    }
  }
  return trimmed.split(",");
}

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const brandSlug = url.searchParams.get("brand");
  if (!brandSlug) {
    return Response.json({ error: "missing brand" }, { status: 400 });
  }

  const brand = getBrand(brandSlug);
  if (!brand) return Response.json({ error: "brand not found" }, { status: 404 });
  if (!isBrandVisibleTo(brand, auth.user)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  if (url.searchParams.get("categories")) {
    return Response.json(listProductCategories(brandSlug));
  }

  return Response.json(listProducts(brandSlug));
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const form = await request.formData();
  const brandSlug = (form.get("brand") ?? "").toString().trim();
  const file = form.get("file");
  const name = (form.get("name") ?? "").toString().trim();
  const categories = parseCategories(form.get("categories"));
  const label = (form.get("label") ?? "").toString().trim();
  const description = (form.get("description") ?? "").toString().trim();

  if (!brandSlug) {
    return Response.json({ error: "missing brand" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "missing file" }, { status: 400 });
  }
  if (!name) {
    return Response.json({ error: "missing name" }, { status: 400 });
  }
  if (!label) {
    return Response.json({ error: "missing label" }, { status: 400 });
  }
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
    const product = saveProduct(
      brandSlug,
      name,
      file.name,
      buffer,
      categories,
      label,
      description || undefined
    );
    return Response.json(product, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | { brand?: unknown; id?: unknown; categories?: unknown }
    | null;
  const brandSlug = typeof body?.brand === "string" ? body.brand : "";
  const id = typeof body?.id === "string" ? body.id : "";

  if (!brandSlug) return Response.json({ error: "missing brand" }, { status: 400 });
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });

  const brand = getBrand(brandSlug);
  if (!brand) return Response.json({ error: "brand not found" }, { status: 404 });
  const editErr = assertCanEditBrand(brandSlug, auth.user, brand);
  if (editErr) return editErr;

  const ok = updateProductCategories(brandSlug, id, parseCategories(body?.categories));
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const brandSlug = url.searchParams.get("brand");
  const id = url.searchParams.get("id");

  if (!brandSlug) return Response.json({ error: "missing brand" }, { status: 400 });
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });

  const brand = getBrand(brandSlug);
  if (!brand) return Response.json({ error: "brand not found" }, { status: 404 });
  const editErr = assertCanEditBrand(brandSlug, auth.user, brand);
  if (editErr) return editErr;

  const ok = deleteProduct(brandSlug, id);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
